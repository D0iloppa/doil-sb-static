'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DJinn } = require('@d0iloppa/djinn');
const { embedPages, loadPrivateIds, EMBEDDER, DIM, MAX_INPUT_CHARS, TABLE, BATCH_SIZE } = require('../lib/page-embed');

const ENV = { OMNIROUTE_URL: 'http://omniroute.test:20128/', OMNIROUTE_API_KEY: 'test-key' };
const quiet = { log() {}, error() {} };
const id = (n) => n.toString(16).padStart(32, '0');
const SENTENCE = '비밀스러운본문문장-ZXQ-9981';

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'page-embed-'));
  const file = path.join(dir, 't.db');
  const db = new DJinn(file);
  db.define('nodes'); db.define('edges'); db.define('meta');
  return { db, file, dir };
}
// 가짜 omniroute: 입력 문자열 길이로 결정되는 비정규화 벡터. calls 에 요청 기록.
function fakeFetch(opts = {}) {
  const calls = [];
  const f = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, auth: init.headers.Authorization, body });
    if (opts.status) return { ok: false, status: opts.status, json: async () => ({}) };
    if (opts.throwNet) throw new Error('ECONNREFUSED');
    const dim = opts.dim ?? DIM;
    const data = body.input.map((s, i) => ({ index: i, embedding: Array.from({ length: dim }, (_, k) => ((k + s.length) % 7) + 1) }));
    if (opts.dropOne) data.pop();
    return { ok: true, status: 200, json: async () => ({ data }) };
  };
  f.calls = calls;
  return f;
}
const node = (n, extra = {}) => ({ id: id(n), title: `page ${n}`, nodeType: 'page', ...extra });
const count = (db) => db.db.prepare(`SELECT COUNT(*) c FROM ${TABLE}`).get().c;
const run = (db, over) => embedPages({ db, nodes: [], texts: new Map(), privateIds: new Set(), fetchImpl: fakeFetch(), env: ENV, log: quiet, ...over });

test('request shape, batching by BATCH_SIZE, meta upserts', async () => {
  const { db } = tmpDb();
  const f = fakeFetch();
  const nodes = Array.from({ length: 35 }, (_, i) => node(i + 1));
  const st = await run(db, { nodes, fetchImpl: f });
  assert.strictEqual(st.state, 'done'); assert.strictEqual(st.embedded, 35);
  const sizes = []; for (let left = 35; left > 0; left -= BATCH_SIZE) sizes.push(Math.min(BATCH_SIZE, left));
  assert.deepStrictEqual(f.calls.map(c => c.body.input.length), sizes);
  assert.strictEqual(f.calls[0].url, 'http://omniroute.test:20128/v1/embeddings');
  assert.strictEqual(f.calls[0].auth, 'Bearer test-key');
  assert.strictEqual(f.calls[0].body.model, 'ollama-local/bge-m3');
  assert.strictEqual(db.get('meta', 'vec_embedder').value, EMBEDDER);
  assert.strictEqual(db.get('meta', 'vec_dim').value, '1024');
});

test('hash skip, and force (backfill) disables it', async () => {
  const { db } = tmpDb();
  const nodes = [node(1), node(2)];
  await run(db, { nodes });
  const f = fakeFetch();
  let st = await run(db, { nodes, fetchImpl: f });
  assert.deepStrictEqual([st.embedded, st.skipped, f.calls.length], [0, 2, 0]);
  // 본문이 바뀌면 해당 페이지만 재임베딩
  st = await run(db, { nodes, texts: new Map([[id(1), '새 본문']]), fetchImpl: f });
  assert.deepStrictEqual([st.embedded, st.skipped], [1, 1]);
  st = await run(db, { nodes, fetchImpl: fakeFetch(), force: true });
  assert.deepStrictEqual([st.embedded, st.skipped], [2, 0]);
  // embedder 가 다른 행은 해시가 같아도 재임베딩
  db.db.prepare(`UPDATE ${TABLE} SET embedder='old' WHERE id=?`).run(id(1));
  st = await run(db, { nodes });
  assert.deepStrictEqual([st.embedded, st.skipped], [1, 1]);
  assert.strictEqual(db.db.prepare(`SELECT embedder FROM ${TABLE} WHERE id=?`).get(id(1)).embedder, EMBEDDER);
});

test('input is capped at MAX_INPUT_CHARS', async () => {
  const { db } = tmpDb();
  const f = fakeFetch();
  await run(db, { nodes: [node(1, { props: { 종류: '메모', n: 3 } })], texts: new Map([[id(1), '가'.repeat(20000)]]), fetchImpl: f });
  const input = f.calls[0].body.input[0];
  assert.strictEqual(input.length, MAX_INPUT_CHARS);
  assert.ok(input.startsWith('page 1\n종류: 메모; n: 3\n가'));
});

test('error keeps old rows and is retried next scan (http, network)', async () => {
  const { db } = tmpDb();
  const nodes = [node(1), node(2)];
  await run(db, { nodes });
  const before = db.db.prepare(`SELECT id, hash, vec FROM ${TABLE} ORDER BY id`).all();
  const texts = new Map([[id(1), 'changed'], [id(2), 'changed']]);
  for (const bad of [{ status: 503 }, { throwNet: true }]) {
    const st = await run(db, { nodes, texts, fetchImpl: fakeFetch(bad) });
    assert.strictEqual(st.state, 'error'); assert.strictEqual(st.failed, 2);
    assert.deepStrictEqual(db.db.prepare(`SELECT id, hash, vec FROM ${TABLE} ORDER BY id`).all(), before);
  }
  const st = await run(db, { nodes, texts });
  assert.strictEqual(st.embedded, 2);
});

test('dim mismatch and count mismatch are rejected, nothing written', async () => {
  const { db } = tmpDb();
  let st = await run(db, { nodes: [node(1)], fetchImpl: fakeFetch({ dim: 3072 }) });
  assert.deepStrictEqual([st.state, st.reason, count(db)], ['error', 'dim_mismatch', 0]);
  st = await run(db, { nodes: [node(1), node(2)], fetchImpl: fakeFetch({ dropOne: true }) });
  assert.deepStrictEqual([st.state, st.reason, count(db)], ['error', 'count_mismatch', 0]);
  assert.strictEqual(db.get('meta', 'vec_embedder'), null);
});

test('partial failure keeps earlier batches', async () => {
  const { db } = tmpDb();
  let n = 0;
  const f = async (u, init) => (++n === 2 ? { ok: false, status: 500, json: async () => ({}) } : fakeFetch()(u, init));
  const st = await run(db, { nodes: Array.from({ length: 20 }, (_, i) => node(i + 1)), fetchImpl: f });
  assert.deepStrictEqual([st.state, st.embedded, st.failed, count(db)], ['error', BATCH_SIZE, 20 - BATCH_SIZE, BATCH_SIZE]);
});

test('private pages: skipped, existing rows deleted', async () => {
  const { db } = tmpDb();
  const nodes = [node(1), node(2), node(3)];
  await run(db, { nodes });
  assert.strictEqual(count(db), 3);
  const f = fakeFetch();
  const st = await run(db, { nodes, privateIds: new Set([id(2)]), fetchImpl: f, texts: new Map([[id(1), 'x']]) });
  assert.strictEqual(count(db), 2);
  assert.ok(!db.db.prepare(`SELECT 1 FROM ${TABLE} WHERE id=?`).get(id(2)));
  assert.strictEqual(st.embedded, 1);
  assert.ok(!f.calls.some(c => c.body.input.some(s => s.startsWith('page 2'))));
});

test('private list unavailable -> embed nothing, delete nothing', async () => {
  const { db } = tmpDb();
  await run(db, { nodes: [node(1)] });
  const f = fakeFetch();
  const st = await run(db, { nodes: [node(1), node(2)], privateIds: null, fetchImpl: f, pruneOrphans: true });
  assert.deepStrictEqual([st.state, st.reason, f.calls.length, count(db)], ['skipped', 'private_list_unavailable', 0, 1]);
});

test('loadPrivateIds: missing/unparseable/bad id -> null; subtree via child edges only', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'priv-'));
  const f = path.join(dir, 'p.json');
  assert.strictEqual(loadPrivateIds(f, [], quiet), null);
  fs.writeFileSync(f, '{not json'); assert.strictEqual(loadPrivateIds(f, [], quiet), null);
  fs.writeFileSync(f, JSON.stringify({ pages: [{ page: 'zz' }] })); assert.strictEqual(loadPrivateIds(f, [], quiet), null);
  fs.writeFileSync(f, JSON.stringify({ pages: [{ page: id(1), subtree: true }, { page: id(9) }] }));
  const edges = [
    { source: id(1), target: id(2), edgeType: 'child' }, { source: id(2), target: id(3) },
    { source: id(1), target: id(4), edgeType: 'mention' }, { source: id(9), target: id(5), edgeType: 'child' },
  ];
  assert.deepStrictEqual([...loadPrivateIds(f, edges, quiet)].sort(), [id(1), id(2), id(3), id(9)].sort());
  fs.writeFileSync(f, JSON.stringify({ version: 1 })); // pages 없음 = 비공개 없음(콘솔과 동일)
  assert.strictEqual(loadPrivateIds(f, [], quiet).size, 0);
});

test('orphan rows deleted only with pruneOrphans (ROOT scan)', async () => {
  const { db } = tmpDb();
  await run(db, { nodes: [node(1), node(2)] });
  await run(db, { nodes: [node(1)] });
  assert.strictEqual(count(db), 2);
  await run(db, { nodes: [node(1)], pruneOrphans: true });
  assert.deepStrictEqual(db.db.prepare(`SELECT id FROM ${TABLE}`).all(), [{ id: id(1) }]);
});

test('missing omniroute config -> skipped with reason, no fetch', async () => {
  const { db } = tmpDb();
  const f = fakeFetch();
  for (const env of [{}, { OMNIROUTE_URL: 'http://x' }, { OMNIROUTE_API_KEY: 'k' }]) {
    const st = await run(db, { nodes: [node(1)], env, fetchImpl: f });
    assert.deepStrictEqual([st.state, st.reason], ['skipped', 'omniroute_not_configured']);
  }
  assert.strictEqual(f.calls.length, 0);
});

test('BLOB round-trip: little-endian float32, L2-normalized, 1024 dims', async () => {
  const { db } = tmpDb();
  await run(db, { nodes: [node(1)] });
  const row = db.db.prepare(`SELECT vec, dim, embedder FROM ${TABLE}`).get();
  assert.strictEqual(row.dim, 1024); assert.strictEqual(row.embedder, EMBEDDER);
  assert.strictEqual(row.vec.length, 1024 * 4);
  const v = Array.from({ length: 1024 }, (_, i) => row.vec.readFloatLE(i * 4));
  const norm = Math.sqrt(v.reduce((a, x) => a + x * x, 0));
  assert.ok(Math.abs(norm - 1) < 1e-5);
  // 가짜 벡터 원본: ((k + len) % 7) + 1, len = 'page 1\n\n'.length
  const len = 'page 1\n\n'.length;
  const raw = Array.from({ length: 1024 }, (_, k) => ((k + len) % 7) + 1);
  const rn = Math.sqrt(raw.reduce((a, x) => a + x * x, 0));
  assert.ok(Math.abs(v[5] - raw[5] / rn) < 1e-6);
});

test('no body text persisted anywhere in the DB file', async () => {
  const { db, file } = tmpDb();
  const lines = [];
  const log = { log: (m) => lines.push(m), error: (m) => lines.push(m) };
  await run(db, { nodes: [node(1, { props: { 메모: '속성값-QQQ' } })], texts: new Map([[id(1), `앞 ${SENTENCE} 뒤`]]), log });
  await run(db, { nodes: [node(1)], texts: new Map([[id(1), SENTENCE]]), fetchImpl: fakeFetch({ status: 500 }), log });
  db.db.pragma('wal_checkpoint(TRUNCATE)'); db.db.close();
  for (const f of [file, `${file}-wal`]) {
    if (!fs.existsSync(f)) continue;
    const buf = fs.readFileSync(f);
    assert.ok(!buf.includes(Buffer.from(SENTENCE)), `${f} contains body text`);
    assert.ok(!buf.includes(Buffer.from('속성값-QQQ')));
  }
  assert.ok(!lines.join('\n').includes(SENTENCE));
});
