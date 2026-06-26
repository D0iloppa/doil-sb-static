const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'doil',
  password: process.env.DB_PASSWORD || 'doildev1!',
  database: process.env.DB_NAME || 'dev',
  max: 3,
});

pool.on('error', (e) => console.error('[sketchpad db] pool error:', e.message));

async function ensureSchema() {
  const sql = fs.readFileSync(path.join(__dirname, 'sketchpad.sql'), 'utf8');
  await pool.query(sql);
}

async function get(id) {
  const { rows } = await pool.query(
    'SELECT id, elements, app_state, updated_at FROM sketchpad WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

async function upsert(id, elements, appState) {
  const { rows } = await pool.query(
    `INSERT INTO sketchpad (id, elements, app_state)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE
       SET elements = $2, app_state = $3, updated_at = NOW()
     RETURNING id, updated_at`,
    [id, JSON.stringify(elements), JSON.stringify(appState)]
  );
  return rows[0];
}

module.exports = { ensureSchema, get, upsert };
