// 관리자 자격증명 접근 — 공유 dev DB. 로그인 시 매번 DB 조회 → 변경 즉시 반영(무재기동).
// role: 'root'(서브관리자 관리 가능) | 'sub'(패널 접근만).
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'doil',
  password: process.env.DB_PASSWORD || 'doildev1!',
  database: process.env.DB_NAME || 'dev',
  max: 2,
});
pool.on('error', (e) => console.error('[admin db] pool error:', e.message));

async function ensureSchema() {
  await pool.query(fs.readFileSync(path.join(__dirname, 'admin.sql'), 'utf8'));
}

async function count() {
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM admin_users');
  return rows[0].n;
}

async function getByUsername(username) {
  const { rows } = await pool.query('SELECT id, username, pw_hash, role FROM admin_users WHERE username = $1', [username]);
  return rows[0] || null;
}

async function listAll() {
  const { rows } = await pool.query('SELECT username, role, created_at FROM admin_users ORDER BY (role=\'root\') DESC, created_at');
  return rows;
}

async function createUser(username, pwHash, role = 'sub') {
  await pool.query(
    'INSERT INTO admin_users (username, pw_hash, role) VALUES ($1, $2, $3) ON CONFLICT (username) DO NOTHING',
    [username, pwHash, role]
  );
}

// 단일 자격 갱신(본인 ID/PW 변경)
async function updateCredential(currentUsername, newUsername, newPwHash) {
  const { rowCount } = await pool.query(
    `UPDATE admin_users SET username = COALESCE($2, username), pw_hash = COALESCE($3, pw_hash), updated_at = now()
     WHERE username = $1`,
    [currentUsername, newUsername || null, newPwHash || null]
  );
  return rowCount > 0;
}

// 서브관리자 삭제(루트는 삭제 불가)
async function deleteSub(username) {
  const { rowCount } = await pool.query("DELETE FROM admin_users WHERE username = $1 AND role <> 'root'", [username]);
  return rowCount > 0;
}

// 루트 보장: root 가 하나도 없으면 env CHATBOT_ID(없으면 최소 id)를 root 로 승격.
async function ensureRoot() {
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM admin_users WHERE role='root'");
  if (rows[0].n > 0) return;
  const envId = process.env.CHATBOT_ID || '';
  if (envId) {
    const { rowCount } = await pool.query("UPDATE admin_users SET role='root' WHERE username=$1", [envId]);
    if (rowCount > 0) return;
  }
  await pool.query("UPDATE admin_users SET role='root' WHERE id=(SELECT id FROM admin_users ORDER BY id LIMIT 1)");
}

module.exports = { pool, ensureSchema, count, getByUsername, listAll, createUser, updateCredential, deleteSub, ensureRoot };
