// market.* 스키마 접근 — 주식 데이터 영속화
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'devdb',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'doil',
  password: process.env.DB_PASSWORD || 'doildev1!',
  database: process.env.DB_NAME || 'dev',
  max: 5,
});

pool.on('error', (e) => console.error('[market-db] pool error:', e.message));

// price_daily upsert (배열)
async function upsertPriceDaily(rows) {
  if (!rows.length) return 0;
  const vals = rows.map((r, i) => {
    const b = i * 8;
    return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8})`;
  }).join(',');
  const flat = rows.flatMap(r => [r.symbol, r.date, r.open, r.high, r.low, r.close, r.adj_close, r.volume]);
  const sql = `
    INSERT INTO market.price_daily (symbol, date, open, high, low, close, adj_close, volume)
    VALUES ${vals}
    ON CONFLICT (symbol, date) DO UPDATE SET
      open=EXCLUDED.open, high=EXCLUDED.high, low=EXCLUDED.low,
      close=EXCLUDED.close, adj_close=EXCLUDED.adj_close, volume=EXCLUDED.volume`;
  const res = await pool.query(sql, flat);
  return res.rowCount;
}

// vix_daily upsert
async function upsertVixDaily(rows) {
  if (!rows.length) return 0;
  const vals = rows.map((r, i) => {
    const b = i * 4;
    return `($${b+1},$${b+2},$${b+3},$${b+4})`;
  }).join(',');
  const flat = rows.flatMap(r => [r.date, r.close, r.high, r.low]);
  const sql = `
    INSERT INTO market.vix_daily (date, close, high, low)
    VALUES ${vals}
    ON CONFLICT (date) DO UPDATE SET
      close=EXCLUDED.close, high=EXCLUDED.high, low=EXCLUDED.low`;
  const res = await pool.query(sql, flat);
  return res.rowCount;
}

// fundamentals_snapshot upsert
async function upsertFundamentals(rows) {
  if (!rows.length) return 0;
  const vals = rows.map((r, i) => {
    const b = i * 9;
    return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9})`;
  }).join(',');
  const flat = rows.flatMap(r => [r.symbol, r.snapshot_date, r.pe, r.pb, r.roe, r.roa, r.beta, r.market_cap, r.div_yield]);
  const sql = `
    INSERT INTO market.fundamentals_snapshot
      (symbol, snapshot_date, pe, pb, roe, roa, beta, market_cap, div_yield)
    VALUES ${vals}
    ON CONFLICT (symbol, snapshot_date) DO UPDATE SET
      pe=EXCLUDED.pe, pb=EXCLUDED.pb, roe=EXCLUDED.roe, roa=EXCLUDED.roa,
      beta=EXCLUDED.beta, market_cap=EXCLUDED.market_cap, div_yield=EXCLUDED.div_yield`;
  const res = await pool.query(sql, flat);
  return res.rowCount;
}

// 마지막 수집일 조회 (증분 수집용)
async function getLastDate(symbol) {
  const res = await pool.query(
    'SELECT MAX(date) AS last FROM market.price_daily WHERE symbol=$1',
    [symbol]
  );
  return res.rows[0]?.last || null;
}

// collect_log 기록
async function logCollect(symbol, rows_upserted, status, message = '') {
  await pool.query(
    'INSERT INTO market.collect_log (symbol, rows_upserted, status, message) VALUES ($1,$2,$3,$4)',
    [symbol, rows_upserted, status, message]
  ).catch(() => {});
}

// features_daily upsert
async function upsertFeatures(rows) {
  if (!rows.length) return 0;
  let count = 0;
  for (const r of rows) {
    await pool.query(`
      INSERT INTO market.features_daily
        (symbol,date,ret_1d,ret_5d,ret_20d,vol_20d,vol_60d,volume_ratio,rsi_14,macd,bb_position,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
      ON CONFLICT (symbol,date) DO UPDATE SET
        ret_1d=$3,ret_5d=$4,ret_20d=$5,vol_20d=$6,vol_60d=$7,
        volume_ratio=$8,rsi_14=$9,macd=$10,bb_position=$11,updated_at=NOW()`,
      [r.symbol,r.date,r.ret_1d,r.ret_5d,r.ret_20d,r.vol_20d,r.vol_60d,
       r.volume_ratio,r.rsi_14,r.macd,r.bb_position]
    );
    count++;
  }
  return count;
}

// price_daily 조회 (피처 계산용)
async function getPriceHistory(symbol, limit = 300) {
  const res = await pool.query(
    'SELECT date, adj_close, volume FROM market.price_daily WHERE symbol=$1 ORDER BY date ASC',
    [symbol]
  );
  return res.rows;
}

// regime_history upsert
async function upsertRegime(rows, model_version = 'v1') {
  for (const r of rows) {
    await pool.query(`
      INSERT INTO market.regime_history (symbol,date,state,prob_bull,prob_neutral,prob_bear,model_version)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (symbol,date,model_version) DO UPDATE SET
        state=$3,prob_bull=$4,prob_neutral=$5,prob_bear=$6`,
      [r.symbol, r.date, r.state, r.prob_bull, r.prob_neutral, r.prob_bear, model_version]
    );
  }
}

// features_daily에 regime 업데이트
async function updateRegimeInFeatures(symbol, rows) {
  for (const r of rows) {
    await pool.query(`
      UPDATE market.features_daily
      SET regime_state=$3, regime_prob_0=$4, regime_prob_1=$5, regime_prob_2=$6, updated_at=NOW()
      WHERE symbol=$1 AND date=$2`,
      [symbol, r.date, r.state, r.prob_bull, r.prob_neutral, r.prob_bear]
    );
  }
}

async function getRegimeHistory(symbol) {
  const res = await pool.query(`
    SELECT date, state, prob_bull, prob_neutral, prob_bear
    FROM market.regime_history
    WHERE symbol=$1 AND model_version='v1'
    ORDER BY date ASC`,
    [symbol]
  );
  return res.rows;
}

async function getLastFeatureDate(symbol) {
  const res = await pool.query(
    'SELECT MAX(date) AS last FROM market.features_daily WHERE symbol=$1',
    [symbol]
  );
  return res.rows[0]?.last || null;
}

// predictions 테이블 초기화 (없으면 생성)
async function ensurePredictionsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS market.predictions (
      symbol       VARCHAR(16) NOT NULL,
      date         DATE        NOT NULL,
      regime_state SMALLINT,
      pred_up_prob NUMERIC(8,4),
      pred_ret_5d  NUMERIC(10,6),
      pred_ret_20d NUMERIC(10,6),
      model_version VARCHAR(16) DEFAULT 'v1',
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (symbol, date, model_version)
    )
  `);
}

async function upsertPrediction(rows, model_version = 'v1') {
  for (const r of rows) {
    await pool.query(`
      INSERT INTO market.predictions (symbol,date,regime_state,pred_up_prob,pred_ret_5d,pred_ret_20d,model_version)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (symbol,date,model_version) DO UPDATE SET
        regime_state=$3, pred_up_prob=$4, pred_ret_5d=$5, pred_ret_20d=$6`,
      [r.symbol, r.date, r.regime_state, r.pred_up_prob, r.pred_ret_5d, r.pred_ret_20d, model_version]
    );
  }
}

// features_daily 전체 조회 (regime_state 포함, 학습용)
async function getFeaturesWithRegime(symbol) {
  const res = await pool.query(`
    SELECT f.date, f.ret_1d, f.ret_5d, f.ret_20d, f.vol_20d, f.vol_60d,
           f.volume_ratio, f.rsi_14, f.macd, f.bb_position,
           f.regime_state,
           p.adj_close AS close
    FROM market.features_daily f
    JOIN market.price_daily p ON p.symbol=f.symbol AND p.date=f.date
    WHERE f.symbol=$1
      AND f.ret_1d IS NOT NULL AND f.vol_20d IS NOT NULL
      AND f.rsi_14 IS NOT NULL AND f.regime_state IS NOT NULL
    ORDER BY f.date ASC`,
    [symbol]
  );
  return res.rows;
}

async function getPredictionHistory(symbol, limit = 60) {
  const res = await pool.query(`
    SELECT date, regime_state, pred_up_prob, pred_ret_5d, pred_ret_20d
    FROM market.predictions
    WHERE symbol=$1 AND model_version='v1'
    ORDER BY date DESC LIMIT $2`,
    [symbol, limit]
  );
  return res.rows.reverse();
}

module.exports = {
  upsertPriceDaily,
  upsertVixDaily,
  upsertFundamentals,
  getLastDate,
  logCollect,
  upsertFeatures,
  getPriceHistory,
  upsertRegime,
  updateRegimeInFeatures,
  getRegimeHistory,
  getLastFeatureDate,
  ensurePredictionsTable,
  upsertPrediction,
  getFeaturesWithRegime,
  getPredictionHistory,
};
