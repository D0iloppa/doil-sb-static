// features_daily 계산 — price_daily → 기술적 지표
// 외부 의존성 없이 순수 JS 구현 (RSI/MACD/BB/수익률/변동성)
const db = require('../db/marketData');

// ─── 수학 유틸 ────────────────────────────────────────────────

function mean(arr) {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function std(arr) {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

// EMA: 초기값은 첫 window개의 SMA
function ema(values, period) {
  const k = 2 / (period + 1);
  const result = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  result[period - 1] = sum / period;
  for (let i = period; i < values.length; i++) {
    result[i] = values[i] * k + result[i - 1] * (1 - k);
  }
  return result;
}

// Wilder's RSI (period=14)
function rsi(closes, period = 14) {
  const result = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return result;

  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

// MACD line (12 EMA - 26 EMA)
function macdLine(closes) {
  const e12 = ema(closes, 12);
  const e26 = ema(closes, 26);
  return closes.map((_, i) =>
    e12[i] !== null && e26[i] !== null ? e12[i] - e26[i] : null
  );
}

// 볼린저밴드 position: (close - lower) / (upper - lower), period=20, k=2
function bbPosition(closes, period = 20) {
  const result = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    const window = closes.slice(i - period + 1, i + 1);
    const m = mean(window);
    const s = std(window);
    if (s === 0) { result[i] = 0.5; continue; }
    const upper = m + 2 * s;
    const lower = m - 2 * s;
    result[i] = Math.max(0, Math.min(1, (closes[i] - lower) / (upper - lower)));
  }
  return result;
}

// ─── 메인 계산 ────────────────────────────────────────────────

function calcFeatures(rows) {
  // rows: [{date, adj_close, volume}] — 날짜 오름차순
  const n = rows.length;
  const closes = rows.map(r => parseFloat(r.adj_close));
  const volumes = rows.map(r => parseFloat(r.volume));

  const rsiArr = rsi(closes, 14);
  const macdArr = macdLine(closes);
  const bbArr = bbPosition(closes, 20);
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);

  // 20일 평균 volume
  const vol20Avg = new Array(n).fill(null);
  for (let i = 19; i < n; i++) {
    vol20Avg[i] = mean(volumes.slice(i - 19, i + 1));
  }

  const features = [];
  for (let i = 0; i < n; i++) {
    if (i < 60) continue; // 충분한 히스토리 필요

    const ret1d = i >= 1 ? (closes[i] - closes[i - 1]) / closes[i - 1] : null;
    const ret5d = i >= 5 ? (closes[i] - closes[i - 5]) / closes[i - 5] : null;
    const ret20d = i >= 20 ? (closes[i] - closes[i - 20]) / closes[i - 20] : null;

    // 20일 수익률 변동성 (std of daily returns)
    const rets20 = [];
    for (let j = i - 19; j <= i; j++) {
      if (j > 0) rets20.push((closes[j] - closes[j - 1]) / closes[j - 1]);
    }
    const vol20d = rets20.length >= 2 ? std(rets20) : null;

    const rets60 = [];
    for (let j = i - 59; j <= i; j++) {
      if (j > 0) rets60.push((closes[j] - closes[j - 1]) / closes[j - 1]);
    }
    const vol60d = rets60.length >= 2 ? std(rets60) : null;

    const volRatio = vol20Avg[i] && volumes[i] ? volumes[i] / vol20Avg[i] : null;

    features.push({
      symbol: rows[i].symbol,
      date: rows[i].date instanceof Date
        ? rows[i].date.toISOString().slice(0, 10)
        : String(rows[i].date).slice(0, 10),
      ret_1d: ret1d !== null ? +ret1d.toFixed(6) : null,
      ret_5d: ret5d !== null ? +ret5d.toFixed(6) : null,
      ret_20d: ret20d !== null ? +ret20d.toFixed(6) : null,
      vol_20d: vol20d !== null ? +vol20d.toFixed(6) : null,
      vol_60d: vol60d !== null ? +vol60d.toFixed(6) : null,
      volume_ratio: volRatio !== null ? +volRatio.toFixed(4) : null,
      rsi_14: rsiArr[i] !== null ? +rsiArr[i].toFixed(4) : null,
      macd: macdArr[i] !== null ? +macdArr[i].toFixed(6) : null,
      bb_position: bbArr[i] !== null ? +bbArr[i].toFixed(4) : null,
    });
  }
  return features;
}

// ─── 심볼별 실행 ──────────────────────────────────────────────

async function calcFeaturesForSymbol(symbol) {
  const rows = await db.getPriceHistory(symbol);
  if (rows.length < 65) return { symbol, count: 0, note: 'insufficient data' };

  const withSym = rows.map(r => ({ ...r, symbol }));
  const features = calcFeatures(withSym);
  if (!features.length) return { symbol, count: 0 };

  const count = await db.upsertFeatures(features);
  return { symbol, count };
}

async function runFeatureCalc(symbols) {
  const { COLLECT_SYMBOLS } = require('../routes/api/collect');
  const targets = symbols || COLLECT_SYMBOLS;
  const results = [];
  for (const sym of targets) {
    try {
      const r = await calcFeaturesForSymbol(sym);
      results.push({ ...r, status: 'ok' });
    } catch (e) {
      console.error(`[feature-calc] ${sym} 실패:`, e.message);
      results.push({ symbol: sym, status: 'error', error: e.message });
    }
  }
  return results;
}

module.exports = { calcFeaturesForSymbol, runFeatureCalc, calcFeatures };
