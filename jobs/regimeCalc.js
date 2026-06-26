// HMM 레짐 감지 실행 — price_daily → regime_history + features_daily 업데이트
const db = require('../db/marketData');
const { runHMM } = require('./hmm');
const { COLLECT_SYMBOLS } = require('../routes/api/collect');

async function calcRegimeForSymbol(symbol, model_version = 'v1') {
  const rows = await db.getPriceHistory(symbol);
  if (rows.length < 65) return { symbol, count: 0, note: 'insufficient data' };

  const results = runHMM(rows);
  if (!results.length) return { symbol, count: 0 };

  const dbRows = results.map(r => ({ symbol, ...r }));
  await db.upsertRegime(dbRows, model_version);
  await db.updateRegimeInFeatures(symbol, dbRows);

  return { symbol, count: results.length };
}

async function runRegimeCalc(symbols, model_version = 'v1') {
  const targets = symbols || COLLECT_SYMBOLS;
  const results = [];
  for (const sym of targets) {
    try {
      const r = await calcRegimeForSymbol(sym, model_version);
      results.push({ ...r, status: 'ok' });
    } catch (e) {
      console.error(`[regime-calc] ${sym} 실패:`, e.message);
      results.push({ symbol: sym, status: 'error', error: e.message });
    }
  }
  return results;
}

module.exports = { calcRegimeForSymbol, runRegimeCalc };
