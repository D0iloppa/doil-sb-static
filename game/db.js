// 게임용 Postgres 연결 + 최소 repo. 기존 dev DB(공유 컨테이너 `db`)를 쓴다.
// 연결 정보는 환경변수로 주입 (docker-compose의 doil-sb environment).
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'doil',
  password: process.env.DB_PASSWORD || 'doildev1!',
  database: process.env.DB_NAME || 'dev',
  max: 5,
});

pool.on('error', (e) => console.error('[db] pool error:', e.message));

// 랜덤 OX 문제 n개
async function getRandomQuestions(n) {
  const { rows } = await pool.query(
    'SELECT id, category, question, answer FROM quiz_question ORDER BY random() LIMIT $1',
    [n]
  );
  return rows;
}

// 플레이어 조회/생성 후 현재 IQ 반환
async function getOrCreatePlayer(playerId, nickname) {
  const { rows } = await pool.query(
    `INSERT INTO game_player (player_id, nickname) VALUES ($1, $2)
     ON CONFLICT (player_id) DO UPDATE SET nickname = EXCLUDED.nickname, updated_at = now()
     RETURNING player_id, nickname, iq`,
    [playerId, nickname]
  );
  return rows[0];
}

// 게임 종료 후 IQ 증감 + 통계 반영. updates: [{ playerId, iqDelta, won }]
async function applyResults(updates) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const u of updates) {
      await client.query(
        `UPDATE game_player
           SET iq = GREATEST(0, iq + $2),
               games_played = games_played + 1,
               wins = wins + $3,
               updated_at = now()
         WHERE player_id = $1`,
        [u.playerId, u.iqDelta, u.won ? 1 : 0]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function ping() {
  await pool.query('SELECT 1');
  return true;
}

module.exports = { pool, getRandomQuestions, getOrCreatePlayer, applyResults, ping };
