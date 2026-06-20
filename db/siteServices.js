// site_services 접근 — 홈페이지 서비스 일람 + 관리자 CRUD. 공유 dev DB.
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

pool.on('error', (e) => console.error('[site-services db] pool error:', e.message));

async function ensureSchema() {
  const sql = fs.readFileSync(path.join(__dirname, 'site_services.sql'), 'utf8');
  await pool.query(sql);
}

const COLS = 'id, type, title, description, href, icon, badge, badge_label, label, sort_order, visible';

// 공개: 노출(visible) 항목만, type·정렬순
async function listVisible() {
  const { rows } = await pool.query(
    `SELECT ${COLS} FROM site_services WHERE visible = true ORDER BY type, sort_order, id`
  );
  return rows;
}

// 관리자: 숨김 포함 전체
async function listAll() {
  const { rows } = await pool.query(
    `SELECT ${COLS} FROM site_services ORDER BY type, sort_order, id`
  );
  return rows;
}

async function create(s) {
  const { rows } = await pool.query(
    `INSERT INTO site_services (type, title, description, href, icon, badge, badge_label, label, sort_order, visible)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10,true))
     RETURNING ${COLS}`,
    [s.type || 'project', s.title || null, s.description || null, s.href, s.icon,
     s.badge || null, s.badge_label || null, s.label || null, s.sort_order || 0, s.visible]
  );
  return rows[0];
}

async function update(id, s) {
  const { rows } = await pool.query(
    `UPDATE site_services SET
       type=COALESCE($2,type), title=$3, description=$4, href=COALESCE($5,href),
       icon=COALESCE($6,icon), badge=$7, badge_label=$8, label=$9,
       sort_order=COALESCE($10,sort_order), visible=COALESCE($11,visible), updated_at=now()
     WHERE id=$1 RETURNING ${COLS}`,
    [id, s.type, s.title ?? null, s.description ?? null, s.href, s.icon,
     s.badge ?? null, s.badge_label ?? null, s.label ?? null, s.sort_order, s.visible]
  );
  return rows[0] || null;
}

async function remove(id) {
  const { rowCount } = await pool.query('DELETE FROM site_services WHERE id=$1', [id]);
  return rowCount > 0;
}

module.exports = { pool, ensureSchema, listVisible, listAll, create, update, remove };
