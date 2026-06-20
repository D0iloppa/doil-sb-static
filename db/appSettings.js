// 관리자 콘솔 설정(key/value) 접근 — 공유 dev DB.
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
pool.on('error', (e) => console.error('[app-settings db] pool error:', e.message));

async function ensureSchema() {
  await pool.query(fs.readFileSync(path.join(__dirname, 'app_settings.sql'), 'utf8'));
}

async function getAll() {
  const { rows } = await pool.query('SELECT key, value FROM app_settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

async function set(key, value) {
  await pool.query(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, value]
  );
}

module.exports = { pool, ensureSchema, getAll, set };
