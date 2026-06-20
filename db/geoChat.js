// geo 챗봇 작업 큐 접근 — 공유 dev DB(별칭 devdb). game/db.js 와 동일한 연결 규약.
// doil-sb 는 적재(createJob)와 조회(getJob)만 한다. 픽업·처리·배포는 host agent 몫.
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

pool.on('error', (e) => console.error('[geo-chat db] pool error:', e.message));

// 부팅 시 테이블 보장(geo_chat.sql 이 진실의 원천 — 동일 DDL).
async function ensureSchema() {
  const sql = fs.readFileSync(path.join(__dirname, 'geo_chat.sql'), 'utf8');
  await pool.query(sql);
}

// 채팅 메시지 1건을 큐에 적재 → 새 job row
async function createJob(sessionId, message) {
  const { rows } = await pool.query(
    `INSERT INTO geo_chat_jobs (session_id, message)
     VALUES ($1, $2)
     RETURNING id, session_id, status, created_at`,
    [sessionId || null, message]
  );
  return rows[0];
}

// job 상태/응답 조회(폴링용)
async function getJob(id) {
  const { rows } = await pool.query(
    `SELECT id, session_id, message, status, reply, result, error, confirmed_at, created_at, updated_at
       FROM geo_chat_jobs WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

// 위험행동(배포 등) 사용자 승인 — needs_confirm → confirmed (에이전트가 배포 단계로 진행)
async function confirmJob(id) {
  const { rows } = await pool.query(
    `UPDATE geo_chat_jobs
        SET confirmed_at = now(), status = 'confirmed', updated_at = now()
      WHERE id = $1 AND status = 'needs_confirm'
      RETURNING id, status, confirmed_at`,
    [id]
  );
  return rows[0] || null;
}

module.exports = { pool, ensureSchema, createJob, getJob, confirmJob };
