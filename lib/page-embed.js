'use strict';

// 페이지 단위 bge-m3 임베딩 (page-level retrieval). 청킹 없음, 본문 저장 없음.
//  - 입력: 제목 + props + 본문 text(메모리 전용, 스캔 범위). 벡터·해시만 DB에 쓴다.
//  - omniroute(OpenAI 호환 /v1/embeddings) 경유만 사용. 직접 호출·폴백 없음.
//  - 비공개 페이지(PRIVATE_PAGES_FILE + 하위 child 엣지)는 임베딩하지 않고 기존 행도 삭제한다.
//    목록을 읽지 못하면 아무것도 임베딩/삭제하지 않는다(fail closed).

const crypto = require('node:crypto');
const fs = require('node:fs');

const MODEL = 'ollama-local/bge-m3';
const EMBEDDER = 'ollama-local/bge-m3@omniroute|page1';
const DIM = 1024;
const BATCH_SIZE = 16;
const TIMEOUT_MS = 120_000;
// Ollama의 bge-m3 로드 컨텍스트가 4096 토큰(모델 최대 8192)이고 초과분은 조용히 잘린다.
// 한국어 실측 ~0.3-0.55 토큰/자, 보수적으로 1자 ~ 0.8토큰 가정 → 5000자.
const MAX_INPUT_CHARS = 5000;
const TABLE = 'page_vec_bge_m3';
const HEX = /^[0-9a-f]{32}$/;

const EMBED_STATE_IDLE = Object.freeze({ state: 'idle', embedded: 0, skipped: 0, failed: 0, reason: null, finished_at: null });

function ensureTable(db) {
  db.db.exec(`CREATE TABLE IF NOT EXISTS ${TABLE} (
    id TEXT PRIMARY KEY,
    hash TEXT NOT NULL,
    embedder TEXT NOT NULL,
    dim INTEGER NOT NULL,
    vec BLOB NOT NULL,
    embedded_at TEXT NOT NULL
  )`);
}

function capChars(s, max = MAX_INPUT_CHARS) {
  if (s.length <= max) return s;
  let out = s.slice(0, max);
  const last = out.charCodeAt(out.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) out = out.slice(0, -1); // 서로게이트 쌍 절단 방지
  return out;
}

function buildInput(node, text) {
  const props = node.props && typeof node.props === 'object'
    ? Object.entries(node.props).map(([k, v]) => `${k}: ${v}`).join('; ')
    : '';
  return capChars(`${node.title || ''}\n${props}\n${text || ''}`);
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

/**
 * PRIVATE_PAGES_FILE 파싱(콘솔 integrations/notion-config.js loadPrivateConfig 와 같은 형식:
 * {pages:[{page:<32hex>, subtree:bool}]}) 후 child 엣지로 하위 트리를 펼친다.
 * 파일이 없거나 파싱/형식 오류면 null(fail closed — 호출자는 아무것도 임베딩/삭제하지 않는다).
 */
function loadPrivateIds(file, edges, log = console) {
  let pages;
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    pages = raw.pages || [];
    if (!Array.isArray(pages)) throw new Error('pages is not an array');
    for (const p of pages) if (!HEX.test(p?.page)) throw new Error('bad page id');
  } catch (e) {
    log.error(`[page-embed] private list unavailable (${e.code || e.message})`);
    return null;
  }
  const kids = new Map();
  for (const e of edges || []) {
    if ((e.edgeType || 'child') !== 'child') continue;
    if (!kids.has(e.source)) kids.set(e.source, []);
    kids.get(e.source).push(e.target);
  }
  const out = new Set();
  for (const p of pages) {
    out.add(p.page);
    if (!p.subtree) continue;
    for (const stack = [p.page]; stack.length;)
      for (const c of kids.get(stack.pop()) || []) if (!out.has(c)) { out.add(c); stack.push(c); }
  }
  return out;
}

function normalizeToBlob(vec) {
  let sum = 0;
  for (const x of vec) {
    if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error('non_finite_value');
    sum += x * x;
  }
  const norm = Math.sqrt(sum);
  if (!(norm > 0)) throw new Error('zero_vector');
  const buf = Buffer.alloc(vec.length * 4);
  for (let i = 0; i < vec.length; i++) buf.writeFloatLE(vec[i] / norm, i * 4);
  return buf;
}

async function callEmbeddings({ url, key, inputs, fetchImpl, timeoutMs }) {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: MODEL, input: inputs }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`http_${res.status}`);
  const body = await res.json();
  const data = body?.data;
  if (!Array.isArray(data) || data.length !== inputs.length) throw new Error('count_mismatch');
  const ordered = [...data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return ordered.map((d) => {
    if (!Array.isArray(d?.embedding) || d.embedding.length !== DIM) throw new Error('dim_mismatch');
    return normalizeToBlob(d.embedding);
  });
}

/**
 * @param {object} o
 *  db: DJinn 인스턴스(db.db = better-sqlite3), nodes: [{id,title,props,nodeType}], texts: Map<id,string>,
 *  privateIds: Set<string>|null, force: 해시 스킵 비활성(백필), pruneOrphans: nodes 에 없는 행 삭제(ROOT 스캔 후),
 *  fetchImpl, env, log, timeoutMs
 * @returns {{state, embedded, skipped, failed, reason, finished_at}}
 */
async function embedPages({ db, nodes, texts, privateIds, force = false, pruneOrphans = false, fetchImpl = globalThis.fetch, env = process.env, log = console, timeoutMs = TIMEOUT_MS }) {
  const st = { state: 'done', embedded: 0, skipped: 0, failed: 0, reason: null, finished_at: null };
  const finish = (state, reason = null) => { st.state = state; st.reason = reason; st.finished_at = new Date().toISOString(); return st; };

  try {
    // fail closed: 비공개 목록 없이는 아무것도 하지 않는다(삭제 포함)
    if (!(privateIds instanceof Set)) return finish('skipped', 'private_list_unavailable');

    ensureTable(db);
    const delStmt = db.db.prepare(`DELETE FROM ${TABLE} WHERE id = ?`);
    let deleted = 0;
    for (const id of privateIds) deleted += delStmt.run(id).changes;
    if (pruneOrphans) {
      const live = new Set(nodes.map((n) => n.id));
      for (const { id } of db.db.prepare(`SELECT id FROM ${TABLE}`).all()) if (!live.has(id)) deleted += delStmt.run(id).changes;
    }
    if (deleted) log.log(`[page-embed] deleted ${deleted} vec rows (private/orphan)`);

    const base = env.OMNIROUTE_URL, key = env.OMNIROUTE_API_KEY;
    if (!base || !key) return finish('skipped', 'omniroute_not_configured');
    const url = `${String(base).replace(/\/+$/, '')}/v1/embeddings`;

    const getHash = db.db.prepare(`SELECT hash, embedder FROM ${TABLE} WHERE id = ?`);
    const todo = [];
    for (const n of nodes) {
      if (n.nodeType === 'group' || privateIds.has(n.id)) continue;
      const input = buildInput(n, texts?.get(n.id));
      const hash = sha256(input + EMBEDDER);
      const row = force ? null : getHash.get(n.id);
      if (row && row.hash === hash && row.embedder === EMBEDDER) { st.skipped++; continue; }
      todo.push({ id: n.id, input, hash });
    }

    const upsert = db.db.prepare(`INSERT INTO ${TABLE} (id, hash, embedder, dim, vec, embedded_at) VALUES (?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET hash=excluded.hash, embedder=excluded.embedder, dim=excluded.dim, vec=excluded.vec, embedded_at=excluded.embedded_at`);
    const writeBatch = db.db.transaction((items, blobs) => {
      const at = new Date().toISOString();
      items.forEach((it, i) => upsert.run(it.id, it.hash, EMBEDDER, DIM, blobs[i], at));
    });

    for (let i = 0; i < todo.length; i += BATCH_SIZE) {
      const items = todo.slice(i, i + BATCH_SIZE);
      try {
        const blobs = await callEmbeddings({ url, key, inputs: items.map((x) => x.input), fetchImpl, timeoutMs });
        writeBatch(items, blobs);
        st.embedded += items.length;
      } catch (e) {
        // 입력 텍스트는 로그에 남기지 않는다. 기존 행은 그대로 두고 다음 스캔에서 재시도.
        st.failed = todo.length - i;
        log.error(`[page-embed] batch failed (${e.message}); ${st.failed} pages retry next scan`);
        if (st.embedded) putMeta(db);
        return finish('error', e.message);
      }
    }
    if (st.embedded || db.db.prepare(`SELECT 1 FROM ${TABLE} LIMIT 1`).get()) putMeta(db);
    log.log(`[page-embed] embedded=${st.embedded} skipped=${st.skipped}`);
    return finish('done');
  } catch (e) {
    log.error(`[page-embed] failed (${e.message})`);
    st.failed = st.failed || 1;
    return finish('error', e.message);
  }
}

function putMeta(db) {
  db.put('meta', 'vec_embedder', { value: EMBEDDER });
  db.put('meta', 'vec_dim', { value: String(DIM) });
}

module.exports = { embedPages, loadPrivateIds, buildInput, EMBED_STATE_IDLE, EMBEDDER, MODEL, DIM, BATCH_SIZE, MAX_INPUT_CHARS, TABLE };
