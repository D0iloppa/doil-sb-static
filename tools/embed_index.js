'use strict';

/**
 * 노션 노드 임베딩 색인기
 * Gemini text-embedding-004 (768차원, 무료 1500 req/day)
 *
 * 사용:
 *   GEMINI_API_KEY=xxx node tools/embed_index.js
 *   GEMINI_API_KEY=xxx node tools/embed_index.js --reset   # 전체 재색인
 */

const path = require('path');
const https = require('https');

const { DJinn, VecDriver } = require('@d0iloppa/djinn');

const DB_PATH  = path.join(__dirname, '../data/notion_meta.db');
const DIM      = 3072;
const GEMINI_MODEL = 'gemini-embedding-001';
const DELAY_MS = 800; // 무료 100 RPM → 600ms 이상, 여유 800ms

// --- env ---
const API_KEY = process.env.GEMINI_API_KEY
  || (() => {
    try {
      const raw = require('fs').readFileSync(
        path.join(__dirname, '../../dopl/tools/assetgen/.env'), 'utf8'
      );
      const m = raw.match(/^GEMINI_API_KEY=(.+)$/m);
      return m ? m[1].trim() : null;
    } catch { return null; }
  })();

if (!API_KEY) {
  console.error('GEMINI_API_KEY 없음. env에 설정하거나 dopl/tools/assetgen/.env에 있어야 한다.');
  process.exit(1);
}

const RESET = process.argv.includes('--reset');

// --- Gemini embed ---
function geminiEmbed(text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      content: { parts: [{ text }] },
    });
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1/models/${GEMINI_MODEL}:embedContent?key=${API_KEY}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (j.error) return reject(new Error(`Gemini: ${j.error.message}`));
          resolve(j.embedding.values);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// 노드 텍스트 조합 — title 위주, 보조로 grp/tags/excerpt
function nodeText(node) {
  const parts = [node.title];
  if (node.grp && node.grp !== 'root') parts.push(node.grp);
  if (Array.isArray(node.tags) && node.tags.length) parts.push(node.tags.join(' '));
  if (node.excerpt) parts.push(node.excerpt);
  return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 2000);
}

// --- main ---
async function main() {
  const db = new DJinn(DB_PATH, { cacheSize: 0 });
  db.define('nodes', { indexes: ['grp', 'nodeType'] });
  db.define('edges', { indexes: ['source', 'target'] });
  db.define('meta');

  // attach 먼저 (sqlite-vec 익스텐션 로드) → 그 다음 차원 체크 및 drop
  const vec = VecDriver.attach(db);

  const vecInfo = db.db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='nodes_vec'"
  ).get();
  if (RESET || (vecInfo && !vecInfo.sql.includes(`float[${DIM}]`))) {
    console.log(`nodes_vec 재생성 (${vecInfo ? '차원 불일치' : '없음'} → float[${DIM}])`);
    db.db.exec('DROP TABLE IF EXISTS nodes_vec_map');
    db.db.exec('DROP TABLE IF EXISTS nodes_vec');
  }

  vec.define('nodes', DIM);

  const all = db.find('nodes', {});
  const total = all.length;

  if (!RESET) {
    // 이미 색인된 ID 목록
    const indexed = new Set(
      db.db.prepare('SELECT doc_id FROM nodes_vec_map').all().map(r => r.doc_id)
    );
    const pending = all.filter(n => !indexed.has(n.id));
    console.log(`노드 ${total}개 중 ${indexed.size}개 기존 색인, ${pending.length}개 신규`);
    if (!pending.length) { console.log('색인 완료 상태'); db.close(); return; }
    await index(vec, pending);
  } else {
    console.log(`전체 재색인: ${total}개`);
    await index(vec, all);
  }

  console.log(`\n완료. 총 색인: ${vec.count('nodes')}개`);
  db.close();
}

async function index(vec, nodes) {
  let ok = 0, fail = 0;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const text = nodeText(node);
    try {
      const embedding = await geminiEmbed(text);
      vec.upsert('nodes', node.id, embedding);
      ok++;
      process.stdout.write(`\r[${i + 1}/${nodes.length}] ✓ ${ok} 실패 ${fail}  `);
    } catch (e) {
      fail++;
      process.stdout.write(`\r[${i + 1}/${nodes.length}] ✗ ${node.title}: ${e.message}\n`);
    }
    if (i < nodes.length - 1) await sleep(DELAY_MS);
  }
  process.stdout.write('\n');
}

main().catch(e => { console.error(e); process.exit(1); });
