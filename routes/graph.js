const express = require('express');
const router  = express.Router();
const path    = require('path');
const { Client } = require('@notionhq/client');
const { DJinn, Schema } = require('@d0iloppa/djinn');

const notion  = new Client({ auth: process.env.NOTION_TOKEN });
const ROOT_ID = 'e8553a423a664a31ba97db9c42265972';

const BLOCK_DEPTH = 6;

const CONTAINER_TYPES = new Set([
  'column_list', 'column', 'toggle', 'synced_block',
  'callout', 'quote', 'bulleted_list_item', 'numbered_list_item',
  'to_do', 'template',
]);

// --- DJinn 초기화 ---
const db = new DJinn(path.join(__dirname, '../data/notion_meta.db'), { cacheSize: 512 });

const nodeSchema = new Schema({
  title: { type: 'string', required: true },
  grp:   { type: 'string', required: true },
  url:   { type: 'string' },
  tags:  { type: 'json',  default: [] },
});
const edgeSchema = new Schema({
  source: { type: 'string', required: true },
  target: { type: 'string', required: true },
});
const metaSchema = new Schema({ value: { type: 'string', required: true } });

db.define('nodes', nodeSchema, { indexes: ['grp'] });
db.define('edges', edgeSchema, { indexes: ['source', 'target'] });
db.define('meta',  metaSchema);

// --- 유틸 ---
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nid = (id) => (id || '').replace(/-/g, '');
const notionUrl = (id) => `https://www.notion.so/${nid(id)}`;

// nodes: DB 컬럼(grp) ↔ 그래프 객체(group) 변환
const graphNodeToDb = (n) => ({
  title: n.title || '(제목 없음)',
  grp:   n.group || 'root',
  url:   n.url   || null,
  tags:  n.tags  || [],
});
const dbNodeToGraph = (n) => ({ id: n.id, title: n.title, group: n.grp, url: n.url, tags: n.tags || [] });

// --- notion_meta.json → DB 일회성 마이그레이션 ---
;(function migrate() {
  if (db.find('nodes').length > 0) return;
  const fs = require('fs');
  const jsonPath = path.join(__dirname, '../data/notion_meta.json');
  if (!fs.existsSync(jsonPath)) return;
  try {
    const raw  = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const entry = (raw.pages || {})[ROOT_ID];
    if (!entry?.nodes?.length) return;
    db.transaction(() => {
      for (const n of entry.nodes)
        db.put('nodes', nid(n.id), graphNodeToDb({ ...n, group: n.group || 'root' }));
      for (const e of (entry.edges || [])) {
        const s = nid(e.source), t = nid(e.target);
        db.put('edges', `${s}→${t}`, { source: s, target: t });
      }
      if (entry.scannedAt) db.put('meta', 'scannedAt', { value: entry.scannedAt });
    });
    console.log(`[graph] notion_meta.json → DB 마이그레이션 완료 (${entry.nodes.length}노드)`);
  } catch (e) { console.error('[graph] 마이그레이션 실패:', e.message); }
})();

// --- DB 전체 로드 (rederiveGroups / extractSubgraph 입력용) ---
function loadRootData() {
  const nodes = db.find('nodes').map(dbNodeToGraph);
  if (!nodes.length) return null;
  const edges     = db.find('edges').map(e => ({ source: e.source, target: e.target }));
  const scannedAt = db.get('meta', 'scannedAt')?.value || null;
  return { nodes, edges, scannedAt };
}

// --- Notion API 헬퍼 ---
async function fetchBlocks(blockId) {
  const blocks = [];
  let cursor;
  do {
    const res = await notion.blocks.children.list({ block_id: blockId, page_size: 100, start_cursor: cursor });
    blocks.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
    if (cursor) await sleep(350);
  } while (cursor);
  return blocks;
}

async function fetchPageMeta(rawPageId) {
  try {
    const page = await notion.pages.retrieve({ page_id: rawPageId });
    const titleProp = Object.values(page.properties || {}).find(p => p.type === 'title');
    const title = titleProp?.title?.map(t => t.plain_text).join('') || '(제목 없음)';
    const parentId = page.parent?.page_id ? nid(page.parent.page_id) : null;
    return { title, parentId };
  } catch (e) {
    console.error(`[graph] fetchPageMeta(${rawPageId}) failed:`, e.message);
    return null;
  }
}

async function queryDatabase(dbId) {
  const pages = [];
  let cursor;
  do {
    const res = await notion.databases.query({ database_id: dbId, page_size: 100, start_cursor: cursor });
    pages.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
    if (cursor) await sleep(350);
  } while (cursor);
  return pages;
}

function extractDbPageTitle(page) {
  const titleProp = Object.values(page.properties || {}).find((p) => p.type === 'title');
  if (titleProp?.title?.length) return titleProp.title.map((t) => t.plain_text).join('');
  return '(제목 없음)';
}

// --- 한 페이지 내부 재귀 스캔 ---
async function scanPageContent(blockId, blockDepth) {
  if (blockDepth > BLOCK_DEPTH) return { childPages: [], mentions: [] };
  await sleep(350);
  let blocks;
  try { blocks = await fetchBlocks(blockId); }
  catch (e) { console.error(`[graph] fetchBlocks(${blockId}) failed:`, e.message); return { childPages: [], mentions: [] }; }

  const childPages = [], mentions = [];

  for (const block of blocks) {
    const type = block.type, inner = block[type] || {};
    if (type === 'child_page')         childPages.push({ id: block.id, title: inner.title || '(제목 없음)', isDb: false });
    else if (type === 'child_database') childPages.push({ id: block.id, title: inner.title || '(DB)', isDb: true });
    else if (type === 'link_to_page') {
      if (inner.page_id)     mentions.push(inner.page_id);
      if (inner.database_id) mentions.push(inner.database_id);
    }
    for (const rt of inner.rich_text || []) {
      if (rt.type === 'mention' && rt.mention?.type === 'page') mentions.push(rt.mention.page.id);
    }
    if (CONTAINER_TYPES.has(type) && block.has_children) {
      const sub = await scanPageContent(block.id, blockDepth + 1);
      childPages.push(...sub.childPages);
      mentions.push(...sub.mentions);
    }
  }
  return { childPages, mentions };
}

// --- 그래프 빌드 ---
async function buildGraph(rawRootId) {
  const rootId = nid(rawRootId);
  const nodesMap = new Map(), edgeSet = new Set();

  function addEdge(src, tgt) {
    const s = nid(src), t = nid(tgt);
    if (s !== t) edgeSet.add(`${s}→${t}`);
  }

  nodesMap.set(rootId, {
    id: rootId, title: rootId === ROOT_ID ? 'DOYCLOPEDIA' : rootId.slice(0, 8),
    tags: [], group: 'root', url: notionUrl(rootId),
  });

  async function traversePage(rawPageId, groupLabel, pageDepth) {
    const pageId = nid(rawPageId);
    const { childPages, mentions } = await scanPageContent(pageId, 0);

    for (const cp of childPages) {
      const cpId = nid(cp.id);
      const childGroup = pageDepth === 0 ? cp.title : groupLabel;
      if (!nodesMap.has(cpId)) {
        nodesMap.set(cpId, { id: cpId, title: cp.title, tags: [], group: childGroup, url: notionUrl(cpId) });
        addEdge(pageId, cpId);
        if (cp.isDb) {
          try {
            await sleep(350);
            const dbPages = await queryDatabase(cpId);
            for (const dbPage of dbPages) {
              const dbId = nid(dbPage.id);
              const title = extractDbPageTitle(dbPage);
              if (!nodesMap.has(dbId)) {
                nodesMap.set(dbId, { id: dbId, title, tags: [], group: childGroup, url: notionUrl(dbId) });
                addEdge(cpId, dbId);
                await traversePage(dbId, childGroup, pageDepth + 1);
              }
            }
          } catch (e) { console.error(`[graph] queryDatabase(${cpId}) failed:`, e.message); }
        } else {
          await traversePage(cpId, childGroup, pageDepth + 1);
        }
      } else {
        addEdge(pageId, cpId);
      }
    }
    for (const rawTarget of mentions) addEdge(pageId, nid(rawTarget));
  }

  await traversePage(rootId, 'root', 0);
  const knownIds = new Set(nodesMap.keys());
  const edges = [...edgeSet].map((k) => { const [source, target] = k.split('→'); return { source, target }; })
    .filter((e) => knownIds.has(e.source) && knownIds.has(e.target));
  return { nodes: [...nodesMap.values()], edges };
}

// --- 그룹 재파생 ---
function rederiveGroups(data) {
  if (!data?.nodes?.length) return data;

  const parentMap = new Map();
  for (const e of data.edges) {
    if (!parentMap.has(e.target)) parentMap.set(e.target, e.source);
  }
  const nodeMap = new Map(data.nodes.map((n) => [n.id, n]));

  const adj = new Map();
  for (const e of data.edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source).push(e.target);
  }
  const depthMap = new Map();
  const queue = [];
  for (const n of data.nodes) {
    if (!parentMap.has(n.id)) { depthMap.set(n.id, 0); queue.push(n.id); }
  }
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i], d = depthMap.get(cur);
    for (const child of (adj.get(cur) || [])) {
      if (!depthMap.has(child)) { depthMap.set(child, d + 1); queue.push(child); }
    }
  }

  const nodes = data.nodes.map((n) => {
    const d = depthMap.get(n.id) ?? 0;
    if (d === 0) return { ...n, group: 'root' };
    if (d === 1) return { ...n, group: n.title };
    const parent = nodeMap.get(parentMap.get(n.id));
    return { ...n, group: parent?.title || n.group };
  });

  return { ...data, nodes };
}

// --- 루트 데이터에서 서브그래프 추출 ---
function extractSubgraph(fullData, subRootId) {
  const nodeMap = new Map(fullData.nodes.map((n) => [n.id, n]));
  if (!nodeMap.has(subRootId)) return null;

  const adj = new Map();
  for (const e of fullData.edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source).push(e.target);
  }

  const visited = new Set([subRootId]);
  const queue = [subRootId];
  while (queue.length) {
    const cur = queue.shift();
    for (const next of (adj.get(cur) || [])) {
      if (!visited.has(next)) { visited.add(next); queue.push(next); }
    }
  }

  const nodes = [...visited].map((id) => {
    const n = { ...nodeMap.get(id) };
    if (n.id === subRootId) n.group = 'root';
    return n;
  }).filter(Boolean);

  const edges = fullData.edges.filter((e) => visited.has(e.source) && visited.has(e.target));
  return { nodes, edges, scannedAt: fullData.scannedAt, extractedFrom: ROOT_ID };
}

// --- 서브트리 DB 병합 ---
function mergeIntoDb(subPageId, freshData, pageMeta) {
  const allEdges = db.find('edges').map(e => ({ id: e.id, source: e.source, target: e.target }));

  // BFS로 기존 하위 노드 수집
  const adj = new Map();
  for (const e of allEdges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source).push(e.target);
  }
  const oldDescendants = new Set();
  const q = [...(adj.get(subPageId) || [])];
  while (q.length) {
    const cur = q.shift();
    if (oldDescendants.has(cur)) continue;
    oldDescendants.add(cur);
    for (const c of (adj.get(cur) || [])) q.push(c);
  }

  const edgesToDel = allEdges
    .filter(e => oldDescendants.has(e.source) || oldDescendants.has(e.target) || e.source === subPageId)
    .map(e => e.id);

  const existingSubNode = db.get('nodes', subPageId);

  db.transaction(() => {
    for (const id of oldDescendants) db.del('nodes', id);
    for (const eid of edgesToDel)    db.del('edges', eid);

    // subPageId 노드 upsert
    if (existingSubNode) {
      // 기존 노드: grp 유지, pageMeta 있으면 title 갱신
      db.put('nodes', subPageId, {
        title: pageMeta?.title || existingSubNode.title,
        grp:   existingSubNode.grp,
        url:   existingSubNode.url || notionUrl(subPageId),
        tags:  existingSubNode.tags || [],
      });
    } else if (pageMeta) {
      // 신규 노드: parent의 grp 상속으로 group 결정
      const parentNode = pageMeta.parentId ? db.get('nodes', pageMeta.parentId) : null;
      const grp = parentNode
        ? (parentNode.grp === 'root' ? pageMeta.title : parentNode.grp)
        : pageMeta.title;
      db.put('nodes', subPageId, graphNodeToDb({ title: pageMeta.title, group: grp, url: notionUrl(subPageId), tags: [] }));
    }

    for (const n of freshData.nodes) {
      if (n.id === subPageId) continue;
      db.put('nodes', n.id, graphNodeToDb(n));
    }
    for (const e of freshData.edges)
      db.put('edges', `${e.source}→${e.target}`, { source: e.source, target: e.target });

    // parent → subPageId 엣지 보장 (신규 페이지일 때 연결 누락 방지)
    if (pageMeta?.parentId && db.get('nodes', pageMeta.parentId)) {
      db.put('edges', `${pageMeta.parentId}→${subPageId}`, { source: pageMeta.parentId, target: subPageId });
    }

    db.put('meta', 'scannedAt', { value: new Date().toISOString() });
  });

  const addedCount = freshData.nodes.filter(n => n.id !== subPageId).length;
  console.log(`[graph] merge: 제거 ${oldDescendants.size}노드 → 추가 ${addedCount}노드`);
}

// --- 스캔 상태 ---
let scanState = { running: false, rootId: null, startedAt: null, result: null, error: null };

async function _runScan(scanRootId) {
  // 서브스캔은 Notion에서 페이지 메타(title, parentId) 먼저 취득
  const pageMeta = scanRootId !== ROOT_ID ? await fetchPageMeta(scanRootId) : null;

  const data     = await buildGraph(scanRootId);
  const now      = new Date().toISOString();
  const hasNodes = db.find('nodes').length > 0;

  if (scanRootId === ROOT_ID) {
    const existingNodeIds = db.find('nodes').map(n => n.id);
    const existingEdgeIds = db.find('edges').map(e => e.id);
    db.transaction(() => {
      for (const id of existingNodeIds) db.del('nodes', id);
      for (const id of existingEdgeIds) db.del('edges', id);
      for (const n of data.nodes) db.put('nodes', n.id, graphNodeToDb(n));
      for (const e of data.edges) db.put('edges', `${e.source}→${e.target}`, { source: e.source, target: e.target });
      db.put('meta', 'scannedAt', { value: now });
    });
  } else if (hasNodes) {
    mergeIntoDb(scanRootId, data, pageMeta);
  } else {
    // ROOT 없음 — fallback
    db.transaction(() => {
      for (const n of data.nodes) db.put('nodes', n.id, graphNodeToDb(n));
      for (const e of data.edges) db.put('edges', `${e.source}→${e.target}`, { source: e.source, target: e.target });
      db.put('meta', 'scannedAt', { value: now });
    });
  }

  return { nodeCount: db.find('nodes').length, edgeCount: db.find('edges').length, now };
}

function runScanAsync(scanRootId) {
  if (scanState.running) return;
  scanState = { running: true, rootId: scanRootId, startedAt: new Date().toISOString(), result: null, error: null };
  console.log(`[graph] 비동기 스캔 시작: ${scanRootId}`);

  _runScan(scanRootId).then(({ nodeCount, edgeCount, now }) => {
    console.log(`[graph] 스캔 완료: ${nodeCount}노드 ${edgeCount}엣지`);
    scanState = { running: false, rootId: scanRootId, startedAt: null, result: { nodes: nodeCount, edges: edgeCount, scannedAt: now }, error: null };
  }).catch((e) => {
    console.error('[graph] 스캔 오류:', e.message);
    scanState = { running: false, rootId: scanRootId, startedAt: null, result: null, error: e.message };
  });
}

// ============================================================
// Routes
// ============================================================

router.get('/data', (req, res) => {
  const data = loadRootData();
  if (!data) return res.status(404).json({ error: 'not_scanned', message: '[Scan] 버튼으로 먼저 스캔해주세요.' });
  res.json(rederiveGroups(data));
});

router.get('/data/:id', (req, res) => {
  const id   = nid(req.params.id);
  const data = loadRootData();
  if (data) {
    const sub = extractSubgraph(data, id);
    if (sub) return res.json(rederiveGroups(sub));
  }
  return res.status(404).json({ error: 'not_scanned', message: '[Scan] 버튼으로 먼저 스캔해주세요.' });
});

router.get('/scan/status', (req, res) => res.json(scanState));

router.get('/heatmap', (req, res) => res.json(db.heatmap()));

router.post('/scan', (req, res) => {
  const rootId = nid(req.body?.rootId || req.query?.rootId || ROOT_ID);
  if (scanState.running) return res.json({ status: 'running', startedAt: scanState.startedAt });
  runScanAsync(rootId);
  res.json({ status: 'started', rootId });
});

router.post('/scan/:id', (req, res) => {
  const id = nid(req.params.id);
  if (scanState.running) return res.json({ status: 'running', startedAt: scanState.startedAt });
  runScanAsync(id);
  res.json({ status: 'started', rootId: id });
});

router.get('/:id', (req, res) => {
  const rootContext = req.headers['x-forwarded-prefix'] || '';
  res.render('graph', { layout: false, rootContext, rootId: nid(req.params.id) });
});

router.get('/', (req, res) => {
  const rootContext = req.headers['x-forwarded-prefix'] || '';
  res.render('graph', { layout: false, rootContext, rootId: '' });
});

module.exports = router;
module.exports.runScanAsync = runScanAsync;
