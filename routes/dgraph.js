const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');
const { DJinn } = require('@d0iloppa/djinn');

// ============================================================
// dGraph — 인터랙티브 그래프 캔버스
//
// 저장소는 Notion용 dJinn(data/notion_meta.db)과 완전히 분리되며 MCP에도
// 등록하지 않는다. 하이브리드 구조:
//   data/dgraph/_index.db  → canvas_list 레지스트리
//   data/dgraph/<cid>.db   → 캔버스별 nodes/edges/meta
// ============================================================

const DGRAPH_DIR = path.join(__dirname, '../data/dgraph');
fs.mkdirSync(DGRAPH_DIR, { recursive: true });

// --- 레지스트리 ---
const indexDb = new DJinn(path.join(DGRAPH_DIR, '_index.db'), { cacheSize: 128 });
indexDb.define('canvas_list', { indexes: ['createdAt'] });

// '캐릭챗' 캔버스는 실수 삭제 방지를 위해 기동 시 1회 잠금 시딩
// (locked 필드가 아예 없을 때만 — 운영자가 명시적으로 unlock한 상태는 존중)
const CHARCHAT_CID = '2fe21dc26adfb888';
{
  const rec = indexDb.get('canvas_list', CHARCHAT_CID);
  if (rec && rec.locked === undefined) indexDb.put('canvas_list', CHARCHAT_CID, { ...rec, locked: true });
}

// --- 캔버스별 인스턴스 캐시 (cid → DJinn) ---
const canvasCache = new Map();
function canvasDb(cid) {
  let db = canvasCache.get(cid);
  if (!db) {
    db = new DJinn(path.join(DGRAPH_DIR, `${cid}.db`), { cacheSize: 256 });
    db.define('nodes', { indexes: ['type'] });
    db.define('edges', { indexes: ['source', 'target'] });
    db.define('meta');
    canvasCache.set(cid, db);
  }
  return db;
}

// --- shape 프리셋: 타입별 기본 모양/크기/색 ---
const SHAPE_PRESETS = {
  base:  { kind: 'circle', size: 22, color: '#c084fc' },
  group: { kind: 'square', size: 15, color: '#d6a04a' },
  node:  { kind: 'circle', size: 9,  color: '#6c8ebf' },
};
const SHAPE_KINDS = new Set(['circle', 'square', 'diamond', 'cylinder']);
function defaultShape(type) { return { ...(SHAPE_PRESETS[type] || SHAPE_PRESETS.node) }; }
function normalizeShape(shape, type) {
  const d = defaultShape(type);
  if (!shape || typeof shape !== 'object') return d;
  return {
    kind:  SHAPE_KINDS.has(shape.kind) ? shape.kind : d.kind,
    size:  Number(shape.size) > 0 ? Number(shape.size) : d.size,
    color: typeof shape.color === 'string' && shape.color ? shape.color : d.color,
  };
}

// --- 유틸 ---
const CID_RE  = /^[a-f0-9]{16}$/;         // canvasID = randomBytes(8).hex
const newCid  = () => crypto.randomBytes(8).toString('hex');
const newNid  = () => crypto.randomBytes(6).toString('hex');
const edgeId  = (s, t) => `${s}__${t}`;    // 방향 있는 쌍당 1개
const nowIso  = () => new Date().toISOString();

function addEdge(db, source, target, type = 'link', _extra) {
  if (source === target) return null;
  const id = edgeId(source, target);
  db.put('edges', id, { source, target, type: type || 'link', _extra: _extra || {} });
  return id;
}

function touch(cid) {
  const rec = indexDb.get('canvas_list', cid);
  if (rec) indexDb.put('canvas_list', cid, { ...rec, updatedAt: nowIso() });
}

// base 노드에서 도달 불가한 노드에 orphan 플래그 부여 (무방향 연결성 기준)
function markOrphans(nodes, edges, rootId = 'base') {
  const adj = new Map(nodes.map(n => [n.id, []]));
  for (const e of edges) {
    if (adj.has(e.source) && adj.has(e.target)) {
      adj.get(e.source).push(e.target);
      adj.get(e.target).push(e.source);
    }
  }
  const seen = new Set();
  if (adj.has(rootId)) {
    const q = [rootId]; seen.add(rootId);
    while (q.length) {
      const cur = q.shift();
      for (const nx of adj.get(cur)) if (!seen.has(nx)) { seen.add(nx); q.push(nx); }
    }
  }
  return nodes.map(n => ({ ...n, orphan: !seen.has(n.id) }));
}

// DB 레코드 → 그래프 노드 (누락 필드 방어)
function toGraphNode(n) {
  return {
    id:     n.id,
    shape:  normalizeShape(n.shape, n.type),
    type:   n.type || 'node',
    title:  n.title || '',
    desc:   n.desc || '',
    _extra: n._extra || {},
  };
}

// --- 캔버스 생성: cid 발행 → <cid>.db 정의 → base 노드 자동생성 → 레지스트리 등록 ---
function createCanvas(title) {
  const cid = newCid();
  const db  = canvasDb(cid);
  const t   = nowIso();
  const name = (title && title.trim()) || 'Untitled';
  db.put('nodes', 'base', {
    shape: defaultShape('base'), type: 'base',
    title: name, desc: '', _extra: {},
  });
  db.put('meta', 'root', { value: 'base' });
  indexDb.put('canvas_list', cid, { title: name, createdAt: t, updatedAt: t });
  return cid;
}

// cid 검증 + 존재 확인 + req.cdb 주입
function requireCanvas(req, res, next) {
  const cid = req.params.cid;
  if (!CID_RE.test(cid)) return res.status(400).json({ error: 'bad_canvas_id' });
  if (!indexDb.get('canvas_list', cid)) return res.status(404).json({ error: 'canvas_not_found' });
  req.cid = cid;
  req.cdb = canvasDb(cid);
  next();
}

// ============================================================
// Routes
// ============================================================

// 신규 캔버스 발행 → 리다이렉트 (/, /new 동일)
router.get(['/', '/new'], (req, res) => {
  const cid = createCanvas(req.query.title);
  const prefix = req.headers['x-forwarded-prefix'] || '';
  res.redirect(prefix + '/dGraph/' + cid);
});

// 신규 캔버스 생성 (JSON — MCP/프로그램용, 리다이렉트 없이 id 반환)
router.post('/', (req, res) => {
  const cid = createCanvas(req.body && req.body.title);
  const prefix = req.headers['x-forwarded-prefix'] || '';
  res.json({ id: cid, url: prefix + '/dGraph/' + cid });
});

// 캔버스 목록
router.get('/list', (req, res) => {
  const rows = indexDb.find('canvas_list', {}, { orderBy: 'updatedAt', orderDir: 'desc' })
    .map(r => ({ id: r.id, title: r.title, createdAt: r.createdAt, updatedAt: r.updatedAt, locked: !!r.locked }));
  res.json({ count: rows.length, canvases: rows });
});

// 캔버스 lock 토글 (locked 캔버스는 삭제 불가)
router.patch('/:cid/lock', requireCanvas, (req, res) => {
  const locked = !!(req.body && req.body.locked);
  const rec = indexDb.get('canvas_list', req.cid);
  indexDb.put('canvas_list', req.cid, { ...rec, locked, updatedAt: nowIso() });
  res.json({ ok: true, locked });
});

// 캔버스 삭제 — 레지스트리 제거 + DB 파일 정리. lock 캔버스는 거부
router.delete('/:cid', requireCanvas, (req, res) => {
  const rec = indexDb.get('canvas_list', req.cid);
  if (rec.locked) return res.status(423).json({ error: 'canvas_locked' });
  const db = canvasCache.get(req.cid);
  if (db) { try { db.close(); } catch (e) { /* 파일 정리는 best-effort */ } canvasCache.delete(req.cid); }
  indexDb.del('canvas_list', req.cid);
  for (const suf of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(path.join(DGRAPH_DIR, `${req.cid}.db${suf}`)); } catch (e) { /* 없거나 잠겨 있어도 무시 */ }
  }
  res.json({ ok: true });
});

// 캔버스 데이터 (orphan 플래그 포함)
router.get('/:cid/data', requireCanvas, (req, res) => {
  const db    = req.cdb;
  const edges = db.find('edges').map(e => ({ id: e.id, source: e.source, target: e.target, type: e.type || 'link' }));
  const nodes = markOrphans(db.find('nodes').map(toGraphNode), edges);
  const canvas = indexDb.get('canvas_list', req.cid);
  res.json({ canvas: { id: req.cid, title: canvas.title, createdAt: canvas.createdAt, updatedAt: canvas.updatedAt }, nodes, edges });
});

// 서브그래프 데이터 (특정 노드 이하만, id 자신 포함) — MCP/외부 연동용 JSON API
// source 인덱스로 노드별 자식 엣지만 조회하며 BFS — 캔버스 전체를 스캔하지 않아
// 캔버스가 커져도(예: 세션이 계속 쌓이는 공용 캔버스) 비용이 서브트리 크기에만 비례한다.
// (orphan 플래그는 캔버스 전체 기준 개념이라 서브그래프 응답에는 포함하지 않는다)
router.get('/:cid/sublist/data', requireCanvas, (req, res) => {
  const rootId = req.query.id;
  if (!rootId) return res.status(400).json({ error: 'id_required' });
  const db = req.cdb;
  const rootDoc = db.get('nodes', rootId);
  if (!rootDoc) return res.status(404).json({ error: 'node_not_found' });

  const nodeIds = new Set([rootId]);
  const edges = [];
  const queue = [rootId];
  while (queue.length) {
    const cur = queue.shift();
    for (const e of db.find('edges', { source: cur })) {
      edges.push({ id: e.id, source: e.source, target: e.target, type: e.type || 'link' });
      if (!nodeIds.has(e.target)) { nodeIds.add(e.target); queue.push(e.target); }
    }
  }
  const nodes = [...nodeIds].map(id => toGraphNode(id === rootId ? rootDoc : db.get('nodes', id))).filter(Boolean);
  const canvas = indexDb.get('canvas_list', req.cid);
  res.json({ canvas: { id: req.cid, title: canvas.title, createdAt: canvas.createdAt, updatedAt: canvas.updatedAt }, root: rootId, nodes, edges });
});

// 서브트리 삭제 (노드 + 하위 전체 + 관련 엣지 일괄 정리) — 리텐션/정리용. base 삭제 금지
router.delete('/:cid/subtree/:nid', requireCanvas, (req, res) => {
  const db = req.cdb;
  const rootId = req.params.nid;
  if (rootId === 'base') return res.status(400).json({ error: 'cannot_delete_base' });
  if (!db.get('nodes', rootId)) return res.status(404).json({ error: 'node_not_found' });

  const nodeIds = new Set([rootId]);
  const queue = [rootId];
  while (queue.length) {
    const cur = queue.shift();
    for (const e of db.find('edges', { source: cur })) {
      if (!nodeIds.has(e.target)) { nodeIds.add(e.target); queue.push(e.target); }
    }
  }

  // 서브트리 내부 엣지 + 바깥에서 서브트리로 들어오는 엣지(예: 부모→루트) 모두 수거
  const edgeIds = new Set();
  for (const id of nodeIds) {
    for (const e of db.find('edges', { source: id })) edgeIds.add(e.id);
    for (const e of db.find('edges', { target: id })) edgeIds.add(e.id);
  }

  db.transaction(() => {
    for (const id of nodeIds) db.del('nodes', id);
    for (const id of edgeIds) db.del('edges', id);
  });
  touch(req.cid);
  res.json({ ok: true, deletedNodes: nodeIds.size, deletedEdges: edgeIds.size });
});

// 노드 추가 (parentId 지정 시 child 엣지 자동, 미지정 시 orphan)
router.post('/:cid/node', requireCanvas, (req, res) => {
  const db = req.cdb;
  const { title, desc, type, shape, parentId, _extra } = req.body || {};
  const t  = type || 'node';
  const id = newNid();
  db.put('nodes', id, {
    shape: normalizeShape(shape, t), type: t,
    title: title || 'Node', desc: desc || '', _extra: _extra || {},
  });
  if (parentId && db.get('nodes', parentId)) addEdge(db, parentId, id);
  touch(req.cid);
  res.json({ id });
});

// 그룹 추가 (type=group)
router.post('/:cid/group', requireCanvas, (req, res) => {
  const db = req.cdb;
  const { title, shape, parentId, _extra } = req.body || {};
  const id = newNid();
  db.put('nodes', id, {
    shape: normalizeShape(shape, 'group'), type: 'group',
    title: title || 'Group', desc: '', _extra: _extra || {},
  });
  if (parentId && db.get('nodes', parentId)) addEdge(db, parentId, id);
  touch(req.cid);
  res.json({ id });
});

// 노드 이동 (재부모화) — 들어오는 엣지를 모두 끊고 새 부모 아래로 연결.
// 하위 엣지는 건드리지 않으므로 서브트리가 통째로 따라온다. base 이동 금지, 자기 하위로 이동(순환) 금지
router.post('/:cid/node/:nid/move', requireCanvas, (req, res) => {
  const db  = req.cdb;
  const nid = req.params.nid;
  const parentId = req.body && req.body.parentId;
  if (nid === 'base') return res.status(400).json({ error: 'cannot_move_base' });
  if (!parentId) return res.status(400).json({ error: 'parent_id_required' });
  if (parentId === nid) return res.status(400).json({ error: 'self_parent' });
  if (!db.get('nodes', nid) || !db.get('nodes', parentId)) return res.status(404).json({ error: 'node_not_found' });

  // 순환 방지: 새 부모가 이동 노드의 서브트리 안에 있으면 거부
  const sub = new Set([nid]);
  const queue = [nid];
  while (queue.length) {
    const cur = queue.shift();
    for (const e of db.find('edges', { source: cur })) {
      if (!sub.has(e.target)) { sub.add(e.target); queue.push(e.target); }
    }
  }
  if (sub.has(parentId)) return res.status(400).json({ error: 'cycle_detected' });

  const incoming = db.find('edges', { target: nid });
  db.transaction(() => {
    for (const e of incoming) db.del('edges', e.id);
    addEdge(db, parentId, nid);
  });
  touch(req.cid);
  res.json({ ok: true, movedTo: parentId, detached: incoming.length });
});

// 노드 수정
router.patch('/:cid/node/:nid', requireCanvas, (req, res) => {
  const db  = req.cdb;
  const nid = req.params.nid;
  const cur = db.get('nodes', nid);
  if (!cur) return res.status(404).json({ error: 'node_not_found' });
  const { title, desc, type, shape, _extra } = req.body || {};
  const nextType = type || cur.type;
  db.put('nodes', nid, {
    shape:  shape ? normalizeShape(shape, nextType) : normalizeShape(cur.shape, nextType),
    type:   nextType,
    title:  title  !== undefined ? title  : cur.title,
    desc:   desc   !== undefined ? desc   : cur.desc,
    _extra: _extra !== undefined ? _extra : (cur._extra || {}),
  });
  touch(req.cid);
  res.json({ ok: true });
});

// 노드 삭제 (연결 엣지 정리, base 삭제 금지)
router.delete('/:cid/node/:nid', requireCanvas, (req, res) => {
  const db  = req.cdb;
  const nid = req.params.nid;
  if (nid === 'base') return res.status(400).json({ error: 'cannot_delete_base' });
  if (!db.get('nodes', nid)) return res.status(404).json({ error: 'node_not_found' });
  const related = db.find('edges').filter(e => e.source === nid || e.target === nid);
  db.transaction(() => {
    db.del('nodes', nid);
    for (const e of related) db.del('edges', e.id);
  });
  touch(req.cid);
  res.json({ ok: true });
});

// 엣지 연결 (자기참조/중복 방지 — 같은 방향 쌍은 upsert)
router.post('/:cid/edge', requireCanvas, (req, res) => {
  const db = req.cdb;
  const { source, target, type, _extra } = req.body || {};
  if (!source || !target) return res.status(400).json({ error: 'source_target_required' });
  if (source === target)  return res.status(400).json({ error: 'self_loop' });
  if (!db.get('nodes', source) || !db.get('nodes', target)) return res.status(404).json({ error: 'node_not_found' });
  const id = addEdge(db, source, target, type, _extra);
  touch(req.cid);
  res.json({ id });
});

// 엣지 삭제
router.delete('/:cid/edge/:eid', requireCanvas, (req, res) => {
  const db  = req.cdb;
  const eid = req.params.eid;
  if (!db.get('edges', eid)) return res.status(404).json({ error: 'edge_not_found' });
  db.del('edges', eid);
  touch(req.cid);
  res.json({ ok: true });
});

// 캔버스 이름 변경
router.patch('/:cid', requireCanvas, (req, res) => {
  const title = req.body && req.body.title;
  if (typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'title_required' });
  const rec = indexDb.get('canvas_list', req.cid);
  const name = title.trim();
  indexDb.put('canvas_list', req.cid, { ...rec, title: name, updatedAt: nowIso() });
  res.json({ ok: true, title: name });
});

// 서브그래프 뷰 (특정 노드 하위만 초기 포커스) — 같은 뷰를 재사용, focusId만 주입
router.get('/:cid/sublist', requireCanvas, (req, res) => {
  const focusId = typeof req.query.id === 'string' ? req.query.id : null;
  const prefix = req.headers['x-forwarded-prefix'] || '';
  res.render('dgraph', { layout: false, rootContext: prefix, canvasId: req.cid, focusId });
});

// 캔버스 뷰 렌더 (마지막 — 다른 라우트에 우선순위 양보)
router.get('/:cid', (req, res) => {
  if (!CID_RE.test(req.params.cid)) return res.status(400).send('bad canvas id');
  const prefix = req.headers['x-forwarded-prefix'] || '';
  res.render('dgraph', { layout: false, rootContext: prefix, canvasId: req.params.cid, focusId: null });
});

module.exports = router;
