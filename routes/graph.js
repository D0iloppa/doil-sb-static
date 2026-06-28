const express = require('express');
const router  = express.Router();
const path    = require('path');
const { Client } = require('@notionhq/client');
const { DJinn } = require('@d0iloppa/djinn');

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

db.define('nodes', { indexes: ['grp', 'nodeType'] });
db.define('edges', { indexes: ['source', 'target'] });
db.define('meta');

// --- 유틸 ---
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nid = (id) => (id || '').replace(/-/g, '');
const notionUrl = (id) => `https://www.notion.so/${nid(id)}`;

// nodes: DB 컬럼(grp) ↔ 그래프 객체(group) 변환
const graphNodeToDb = (n) => ({
  title:    n.title    || '(제목 없음)',
  grp:      n.group    || 'root',
  url:      n.url      || null,
  tags:     n.tags     || [],
  nodeType: n.nodeType || 'page',
  excerpt:  n.excerpt  || '',
  ...(n.props && Object.keys(n.props).length ? { props: n.props } : {}),
});
const dbNodeToGraph = (n) => ({ id: n.id, title: n.title, group: n.grp, url: n.url, tags: n.tags || [], nodeType: n.nodeType || 'page', excerpt: n.excerpt || '', ...(n.props ? { props: n.props } : {}) });

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
        db.put('edges', `${s}→${t}→child`, { source: s, target: t, edgeType: 'child' });
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
  const edges     = db.find('edges').map(e => ({ source: e.source, target: e.target, edgeType: e.edgeType || 'child' }));
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
    const p = page.parent;
    const parentId = p?.type === 'page_id'      ? nid(p.page_id)
                   : p?.type === 'block_id'     ? nid(p.block_id)
                   : p?.type === 'database_id'  ? nid(p.database_id)
                   : null;
    return { title, parentId, nodeType: 'page' };
  } catch (_) {
    // page 조회 실패 시 database로 재시도
    try {
      const dbMeta = await notion.databases.retrieve({ database_id: rawPageId });
      const title  = dbMeta.title?.map(t => t.plain_text).join('') || '(제목 없음)';
      const p2 = dbMeta.parent;
      const parentId = p2?.type === 'page_id'     ? nid(p2.page_id)
                     : p2?.type === 'block_id'    ? nid(p2.block_id)
                     : p2?.type === 'database_id' ? nid(p2.database_id)
                     : null;
      return { title, parentId, nodeType: 'database' };
    } catch (e) {
      console.error(`[graph] fetchPageMeta(${rawPageId}) failed:`, e.message);
      return null;
    }
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

// DB의 select/multi_select 속성 목록 조회
async function fetchDbGroupProps(rawDbId) {
  try {
    await sleep(350);
    const meta = await notion.databases.retrieve({ database_id: rawDbId });
    const props = [];
    for (const [name, prop] of Object.entries(meta.properties || {})) {
      if (prop.type === 'select' || prop.type === 'multi_select') {
        props.push({ name, type: prop.type });
      }
    }
    return props;
  } catch (e) {
    console.error(`[graph] fetchDbGroupProps(${rawDbId}) failed:`, e.message);
    return [];
  }
}

// DB 페이지의 rich_text 속성 전체를 { 속성명: 값 } 객체로 추출
function extractRichTextProps(page) {
  const result = {};
  for (const [name, prop] of Object.entries(page.properties || {})) {
    if (prop.type === 'rich_text' && prop.rich_text?.length) {
      const val = prop.rich_text.map(t => t.plain_text).join('').trim();
      if (val) result[name] = val;
    }
  }
  return result;
}

// 페이지에서 해당 속성의 값 배열 추출
function extractPropValues(page, propName, propType) {
  const prop = page.properties?.[propName];
  if (!prop) return [];
  if (propType === 'select')       return prop.select?.name ? [prop.select.name] : [];
  if (propType === 'multi_select') return (prop.multi_select || []).map(o => o.name).filter(Boolean);
  return [];
}

const EXCERPT_TYPES = new Set([
  'paragraph', 'heading_1', 'heading_2', 'heading_3',
  'callout', 'quote', 'bulleted_list_item', 'numbered_list_item', 'to_do',
]);
const EXCERPT_MAX = 300;

// --- 한 페이지 내부 재귀 스캔 ---
async function scanPageContent(blockId, blockDepth) {
  if (blockDepth > BLOCK_DEPTH) return { childPages: [], mentions: [], excerpt: '' };
  await sleep(350);
  let blocks;
  try { blocks = await fetchBlocks(blockId); }
  catch (e) { console.error(`[graph] fetchBlocks(${blockId}) failed:`, e.message); return { childPages: [], mentions: [], excerpt: '' }; }

  const childPages = [], mentions = [];
  const excerptParts = [];

  for (const block of blocks) {
    const type = block.type, inner = block[type] || {};

    // depth=0 에서만 텍스트 수집 (300자 이내)
    if (blockDepth === 0 && EXCERPT_TYPES.has(type)) {
      const text = (inner.rich_text || []).map(t => t.plain_text).join('').trim();
      if (text && excerptParts.join(' ').length < EXCERPT_MAX) excerptParts.push(text);
    }

    if (type === 'child_page')         childPages.push({ id: block.id, title: inner.title || '(제목 없음)', isDb: false });
    else if (type === 'child_database') childPages.push({ id: block.id, title: inner.title || '(DB)', isDb: true });
    else if (type === 'link_to_page') {
      if (inner.page_id)     mentions.push(inner.page_id);
      if (inner.database_id) mentions.push(inner.database_id);
    }
    for (const rt of inner.rich_text || []) {
      if (rt.type !== 'mention') continue;
      if (rt.mention?.type === 'page')     mentions.push(rt.mention.page.id);
      if (rt.mention?.type === 'database') mentions.push(rt.mention.database.id);
    }
    if (CONTAINER_TYPES.has(type) && block.has_children) {
      const sub = await scanPageContent(block.id, blockDepth + 1);
      childPages.push(...sub.childPages);
      mentions.push(...sub.mentions);
    }
  }
  return { childPages, mentions, excerpt: excerptParts.join(' ').slice(0, EXCERPT_MAX) };
}

// --- 그래프 빌드 ---
async function buildGraph(rawRootId, onNodeDiscovered = null) {
  const rootId = nid(rawRootId);
  const nodesMap = new Map();
  // key: 's→t', value: { source, target, edgeType } — child가 mention을 덮어씀
  const edgeMap = new Map();

  function addEdge(src, tgt, edgeType = 'child') {
    const s = nid(src), t = nid(tgt);
    if (s === t) return;
    edgeMap.set(`${s}→${t}→${edgeType}`, { source: s, target: t, edgeType });
  }

  // root가 DB인지 먼저 확인
  let rootIsDb = false;
  let rootTitle = rootId === ROOT_ID ? 'DOYCLOPEDIA' : rootId.slice(0, 8);
  if (rootId !== ROOT_ID) {
    try {
      const dbMeta = await notion.databases.retrieve({ database_id: rootId });
      rootIsDb = true;
      rootTitle = dbMeta.title?.map(t => t.plain_text).join('') || rootTitle;
    } catch (_) { /* page 타입 — 무시 */ }
  }

  function addNode(node) {
    nodesMap.set(node.id, node);
    if (onNodeDiscovered) onNodeDiscovered(node);
  }

  addNode({
    id: rootId, title: rootTitle,
    tags: [], group: 'root', url: notionUrl(rootId), nodeType: rootIsDb ? 'database' : 'page',
  });

  async function traversePage(rawPageId, groupLabel, pageDepth) {
    const pageId = nid(rawPageId);
    const { childPages, mentions, excerpt } = await scanPageContent(pageId, 0);

    // 이 페이지의 excerpt 업데이트
    if (excerpt) {
      const node = nodesMap.get(pageId);
      if (node) nodesMap.set(pageId, { ...node, excerpt });
    }

    for (const cp of childPages) {
      const cpId = nid(cp.id);
      const childGroup = pageDepth === 0 ? cp.title : groupLabel;
      if (!nodesMap.has(cpId)) {
        addNode({ id: cpId, title: cp.title, tags: [], group: childGroup, url: notionUrl(cpId), nodeType: cp.isDb ? 'database' : 'page' });
        addEdge(pageId, cpId, 'child');
        if (cp.isDb) {
          try {
            const groupProps = await fetchDbGroupProps(cpId);
            const dbPages    = await queryDatabase(cpId);
            for (const dbPage of dbPages) {
              const dpId  = nid(dbPage.id);
              const title = extractDbPageTitle(dbPage);
              if (!nodesMap.has(dpId)) {
                const tags  = groupProps.flatMap(p => extractPropValues(dbPage, p.name, p.type));
                const props = extractRichTextProps(dbPage);
                addNode({ id: dpId, title, tags, props, group: childGroup, url: notionUrl(dpId), nodeType: 'page' });

                if (groupProps.length > 0) {
                  let grouped = false;
                  for (const prop of groupProps) {
                    const vals = extractPropValues(dbPage, prop.name, prop.type);
                    for (const val of vals) {
                      const gId = `grp_${cpId}_${prop.name}_${val}`;
                      if (!nodesMap.has(gId)) {
                        addNode({ id: gId, title: val, tags: [], group: childGroup, url: null, nodeType: 'group' });
                        addEdge(cpId, gId, 'child');
                      }
                      addEdge(gId, dpId, 'child');
                      grouped = true;
                    }
                  }
                  if (!grouped) addEdge(cpId, dpId, 'child');
                } else {
                  addEdge(cpId, dpId, 'child');
                }

                await traversePage(dpId, childGroup, pageDepth + 1);
              }
            }
          } catch (e) { console.error(`[graph] queryDatabase(${cpId}) failed:`, e.message); }
        } else {
          await traversePage(cpId, childGroup, pageDepth + 1);
        }
      } else {
        addEdge(pageId, cpId, 'child');
      }
    }
    for (const rawTarget of mentions) {
      const tid = nid(rawTarget);
      if (!nodesMap.has(tid)) {
        await sleep(350);
        const meta = await fetchPageMeta(tid);
        if (meta) addNode({ id: tid, title: meta.title, tags: [], group: meta.parentId || 'root', url: notionUrl(tid), nodeType: meta.nodeType || 'page' });
      }
      addEdge(pageId, tid, 'mention');
    }
  }

  if (rootIsDb) {
    try {
      const groupProps = await fetchDbGroupProps(rootId);
      const dbPages    = await queryDatabase(rootId);
      for (const dbPage of dbPages) {
        const cpId    = nid(dbPage.id);
        const cpTitle = extractDbPageTitle(dbPage);
        if (nodesMap.has(cpId)) continue;
        const tags  = groupProps.flatMap(p => extractPropValues(dbPage, p.name, p.type));
        const props = extractRichTextProps(dbPage);
        addNode({ id: cpId, title: cpTitle, tags, props, group: cpTitle, url: notionUrl(cpId), nodeType: 'page' });
        if (groupProps.length > 0) {
          let grouped = false;
          for (const prop of groupProps) {
            const vals = extractPropValues(dbPage, prop.name, prop.type);
            for (const val of vals) {
              const gId = `grp_${rootId}_${prop.name}_${val}`;
              if (!nodesMap.has(gId)) {
                addNode({ id: gId, title: val, tags: [], group: 'root', url: null, nodeType: 'group' });
                addEdge(rootId, gId, 'child');
              }
              addEdge(gId, cpId, 'child');
              grouped = true;
            }
          }
          if (!grouped) addEdge(rootId, cpId, 'child');
        } else {
          addEdge(rootId, cpId, 'child');
        }
        await traversePage(cpId, cpTitle, 1);
      }
    } catch (e) { console.error(`[graph] DB root scan failed (${rootId}):`, e.message); }
  } else {
    await traversePage(rootId, 'root', 0);
  }
  const knownIds = new Set(nodesMap.keys());
  const edges = [...edgeMap.values()].filter(e => knownIds.has(e.source) && knownIds.has(e.target));
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
  const allEdges = db.find('edges').map(e => ({ id: e.id, source: e.source, target: e.target, edgeType: e.edgeType }));

  // BFS로 기존 하위 노드 수집 — child 엣지만 따라간다.
  // mention 엣지까지 포함하면 외부 페이지를 통한 역방향 사이클이 생겨
  // subPageId 자신이 oldDescendants에 들어가 incoming 엣지가 잘못 삭제된다.
  const adj = new Map();
  for (const e of allEdges) {
    if (e.edgeType !== 'child') continue;
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
      const title = pageMeta?.title || existingSubNode.title;
      // grp가 'root'(스캔 임시값)이면 parentNode에서 재계산, 아니면 유지
      const parentNode = pageMeta?.parentId ? db.get('nodes', pageMeta.parentId) : null;
      const grp = existingSubNode.grp !== 'root'
        ? existingSubNode.grp
        : parentNode
          ? (parentNode.grp === 'root' ? title : parentNode.grp)
          : title;
      db.put('nodes', subPageId, {
        title,
        grp,
        url:      existingSubNode.url || notionUrl(subPageId),
        tags:     existingSubNode.tags || [],
        nodeType: existingSubNode.nodeType || 'page',
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
      db.put('edges', `${e.source}→${e.target}→${e.edgeType || 'child'}`, { source: e.source, target: e.target, edgeType: e.edgeType || 'child' });

    // parent → subPageId 엣지 보장 (신규 페이지일 때 연결 누락 방지)
    if (pageMeta?.parentId && db.get('nodes', pageMeta.parentId)) {
      db.put('edges', `${pageMeta.parentId}→${subPageId}`, { source: pageMeta.parentId, target: subPageId, edgeType: 'child' });
    }

    db.put('meta', 'scannedAt', { value: new Date().toISOString() });
  });

  const addedCount = freshData.nodes.filter(n => n.id !== subPageId).length;
  console.log(`[graph] merge: 제거 ${oldDescendants.size}노드 → 추가 ${addedCount}노드`);
}

// --- 스캔 상태 ---
let scanState = { running: false, rootId: null, startedAt: null, result: null, error: null };

async function _runScan(scanRootId) {
  const pageMeta = scanRootId !== ROOT_ID ? await fetchPageMeta(scanRootId) : null;

  if (scanRootId === ROOT_ID) {
    // 스캔 전 기존 노드 ID 목록 — 스캔 후 stale 노드 제거용
    const preExistingIds = new Set(db.find('nodes').map(n => n.id));
    const foundIds = new Set();

    const data = await buildGraph(scanRootId, (node) => {
      db.put('nodes', node.id, graphNodeToDb(node));
      foundIds.add(node.id);
    });

    const now = new Date().toISOString();
    const existingEdgeIds = db.find('edges').map(e => e.id);
    db.transaction(() => {
      // stale 노드 제거
      for (const id of preExistingIds) {
        if (!foundIds.has(id)) db.del('nodes', id);
      }
      // 노드 전체 재기록 — excerpt·tags 포함 최종값으로 덮어씀
      for (const n of data.nodes) db.put('nodes', n.id, graphNodeToDb(n));
      // 엣지 교체
      for (const id of existingEdgeIds) db.del('edges', id);
      for (const e of data.edges) db.put('edges', `${e.source}→${e.target}→${e.edgeType || 'child'}`, { source: e.source, target: e.target, edgeType: e.edgeType || 'child' });
      db.put('meta', 'scannedAt', { value: now });
    });

    return { nodeCount: db.find('nodes').length, edgeCount: db.find('edges').length, now };
  }

  const scanRootNid = nid(scanRootId);
  const data     = await buildGraph(scanRootId, (node) => {
    // 루트 노드 title은 buildGraph가 slice(0,8)로 세팅 — pageMeta로 즉시 교정
    const title = (node.id === scanRootNid && pageMeta?.title) ? pageMeta.title : node.title;
    db.put('nodes', node.id, graphNodeToDb({ ...node, title }));
  });
  const now      = new Date().toISOString();
  const hasNodes = db.find('nodes').length > 0;

  if (hasNodes) {
    mergeIntoDb(scanRootId, data, pageMeta);
  } else {
    // ROOT 없음 — fallback
    db.transaction(() => {
      for (const n of data.nodes) db.put('nodes', n.id, graphNodeToDb(n));
      for (const e of data.edges) db.put('edges', `${e.source}→${e.target}→${e.edgeType || 'child'}`, { source: e.source, target: e.target, edgeType: e.edgeType || 'child' });
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

// 노드 제목 검색 (LIKE)
router.get('/search', (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: 'q required' });
  const nodes = db.find('nodes', { title: `%${q}%` }).map(dbNodeToGraph);
  res.json({ count: nodes.length, nodes });
});

// node의 top-level 필드 vs props.* 필드 판별 (도메인 지식)
const TOP_NODE_FIELDS = new Set(['id', 'title', 'grp', 'url', 'nodeType', 'excerpt', 'tags']);
const nodeOrderBy = (field) => field && !TOP_NODE_FIELDS.has(field) ? `props.${field}` : field;

// props 포함 값 추출 — db.toCSV()의 커스텀 resolver로 전달
const nodeVal = (rec, field) => {
  if (field === 'id') return rec.id ?? '';
  if (field in rec) {
    const v = rec[field];
    return Array.isArray(v) ? v.join(';') : (v == null ? '' : String(v));
  }
  return String((rec.props || {})[field] ?? '');
};

// 특정 노드의 직계 자식 수
router.get('/children/count/:id', (req, res) => {
  const id = nid(req.params.id);
  const count = db.count('edges', { source: id });
  res.json({ id, count });
});

// 특정 노드의 직계 자식 목록 (페이징)
router.get('/children/:id', (req, res) => {
  const id = nid(req.params.id);
  const [orderField, orderDir] = (req.query.order_by || '').split(':');
  const limit  = parseInt(req.query.limit)  || null;
  const offset = Math.max(0, parseInt(req.query.offset) || 0);

  const childIds = db.find('edges', { source: id })
    .filter(e => (e.edgeType || 'child') === 'child')
    .map(e => e.target);

  const total = childIds.length;
  const nodes = db.findByIds('nodes', childIds, {
    orderBy:  nodeOrderBy(orderField),
    orderDir: orderDir || 'asc',
    limit,
    offset,
  }).map(n => dbNodeToGraph(n));

  res.json({ id, total, offset, limit, nodes });
});

router.get('/csv', (req, res) => {
  const rawColumns = (req.query.columns || '').split(',').map(c => c.trim()).filter(Boolean);
  if (!rawColumns.length) return res.status(400).json({ error: 'columns required' });

  const [orderField, orderDir] = (req.query.order_by || '').split(':');
  const limit  = parseInt(req.query.limit)  || null;
  const offset = Math.max(0, parseInt(req.query.offset) || 0);

  const where = {};
  if (req.query.grp) where.grp = req.query.grp;
  if (req.query.q)   where.title = `%${req.query.q}%`;

  let nodes = db.find('nodes', where, {
    orderBy:  nodeOrderBy(orderField),
    orderDir: orderDir || 'asc',
  });

  if (req.query.parent) {
    const pid = nid(req.query.parent);
    const childIds = new Set(
      db.find('edges', { source: pid })
        .filter(e => (e.edgeType || 'child') === 'child')
        .map(e => e.target)
    );
    nodes = nodes.filter(n => childIds.has(n.id));
  }

  const total = nodes.length;
  nodes = nodes.slice(offset, limit != null ? offset + limit : undefined);

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('X-Total-Count', total);
  res.send(db.toCSV(nodes, rawColumns, nodeVal));
});

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

// --- 자동 재스캔: 시작 30분 후 첫 실행, 이후 6시간마다 ---
// runScanAsync는 scanState.running 가드가 있어 중복 실행 없음
setTimeout(() => {
  runScanAsync(ROOT_ID);
  setInterval(() => runScanAsync(ROOT_ID), 6 * 60 * 60 * 1000);
}, 30 * 60 * 1000);

module.exports = router;
module.exports.runScanAsync = runScanAsync;
