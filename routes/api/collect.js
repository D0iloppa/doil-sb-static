// market 데이터 수집 API — price_daily, fundamentals_snapshot, features_daily
const express = require('express');
const router = express.Router();
const db = require('../../db/marketData');

const YAHOO_BASE = 'https://query2.finance.yahoo.com';

// 수집 대상 심볼 (^VIX, ^GSPC 등 인덱스 포함)
const COLLECT_SYMBOLS = ['SPY', 'QQQ', 'VT', 'BND', 'TLT', 'GLD', '^VIX', '^GSPC', '^KS11'];

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

// Yahoo Finance v8 OHLCV 조회
// lastDate가 있으면 그 다음날부터, 없으면 5년치 백필
async function fetchYahooOHLCV(symbol, lastDate) {
  const enc = encodeURIComponent(symbol);
  let period1, period2;
  period2 = Math.floor(Date.now() / 1000);
  if (lastDate) {
    const d = new Date(lastDate);
    d.setDate(d.getDate() + 1);
    period1 = Math.floor(d.getTime() / 1000);
  } else {
    // 5년 백필
    period1 = period2 - 5 * 365 * 24 * 3600;
  }
  const url = `${YAHOO_BASE}/v8/finance/chart/${enc}?period1=${period1}&period2=${period2}&interval=1d&includeAdjustedClose=true`;
  const data = await fetchJson(url);
  const result = data?.chart?.result?.[0];
  if (!result) return [];

  const timestamps = result.timestamp || [];
  const q = result.indicators?.quote?.[0] || {};
  const adjclose = result.indicators?.adjclose?.[0]?.adjclose || [];
  const rows = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (!timestamps[i]) continue;
    const date = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);
    rows.push({
      symbol,
      date,
      open: q.open?.[i] ?? null,
      high: q.high?.[i] ?? null,
      low: q.low?.[i] ?? null,
      close: q.close?.[i] ?? null,
      adj_close: adjclose[i] ?? null,
      volume: q.volume?.[i] ?? null,
    });
  }
  return rows;
}

// Yahoo Finance v10 fundamentals (US 심볼만)
async function fetchYahooFundamentals(symbol) {
  if (symbol.startsWith('^')) return null; // 인덱스 펀더멘털 없음
  const enc = encodeURIComponent(symbol);
  const url = `${YAHOO_BASE}/v10/finance/quoteSummary/${enc}?modules=defaultKeyStatistics,financialData,summaryDetail`;
  try {
    const data = await fetchJson(url);
    const r = data?.quoteSummary?.result?.[0];
    if (!r) return null;
    const ks = r.defaultKeyStatistics || {};
    const fd = r.financialData || {};
    const sd = r.summaryDetail || {};
    return {
      symbol,
      snapshot_date: new Date().toISOString().slice(0, 10),
      pe: sd.trailingPE?.raw ?? null,
      pb: ks.priceToBook?.raw ?? null,
      roe: fd.returnOnEquity?.raw ?? null,
      roa: fd.returnOnAssets?.raw ?? null,
      beta: ks.beta?.raw ?? null,
      market_cap: ks.enterpriseValue?.raw ?? null,
      div_yield: sd.dividendYield?.raw ?? null,
    };
  } catch {
    return null;
  }
}

// 단일 심볼 수집 (price + fundamentals)
async function collectSymbol(symbol) {
  const lastDate = await db.getLastDate(symbol);
  const rows = await fetchYahooOHLCV(symbol, lastDate);
  let priceCount = 0;
  if (rows.length > 0) {
    // ^VIX는 vix_daily에도 별도 적재
    if (symbol === '^VIX') {
      const vixRows = rows.map(r => ({ date: r.date, close: r.close, high: r.high, low: r.low }));
      await db.upsertVixDaily(vixRows);
    }
    priceCount = await db.upsertPriceDaily(rows);
  }
  const fundRow = await fetchYahooFundamentals(symbol);
  if (fundRow) {
    await db.upsertFundamentals([fundRow]);
  }
  return { symbol, priceCount, backfill: !lastDate };
}

// POST /api/stock/collect — 전체 수집 실행
router.post('/collect', async (req, res) => {
  const symbols = req.body?.symbols || COLLECT_SYMBOLS;
  const results = [];
  for (const sym of symbols) {
    try {
      const r = await collectSymbol(sym);
      await db.logCollect(sym, r.priceCount, 'ok', r.backfill ? 'backfill' : 'incremental');
      results.push({ ...r, status: 'ok' });
    } catch (e) {
      await db.logCollect(sym, 0, 'error', e.message);
      results.push({ symbol: sym, status: 'error', error: e.message });
    }
  }
  res.json({ ok: true, results });
});

// GET /api/stock/collect/status — 심볼별 마지막 수집일
router.get('/collect/status', async (req, res) => {
  const rows = [];
  for (const sym of COLLECT_SYMBOLS) {
    const last = await db.getLastDate(sym).catch(() => null);
    rows.push({ symbol: sym, last_date: last });
  }
  res.json({ symbols: rows });
});

// POST /api/stock/features — features_daily 계산 (price_daily 기반)
router.post('/features', async (req, res) => {
  const symbols = req.body?.symbols || COLLECT_SYMBOLS;
  try {
    const { runFeatureCalc } = require('../../jobs/featureCalc');
    const results = await runFeatureCalc(symbols);
    res.json({ ok: true, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/stock/features/status — 심볼별 마지막 피처 계산일
router.get('/features/status', async (req, res) => {
  const rows = [];
  for (const sym of COLLECT_SYMBOLS) {
    const last = await db.getLastFeatureDate(sym).catch(() => null);
    rows.push({ symbol: sym, last_date: last });
  }
  res.json({ symbols: rows });
});

// POST /api/stock/regime — HMM 레짐 감지 실행
router.post('/regime', async (req, res) => {
  const symbols = req.body?.symbols || COLLECT_SYMBOLS;
  const version = req.body?.version || 'v1';
  try {
    const { runRegimeCalc } = require('../../jobs/regimeCalc');
    const results = await runRegimeCalc(symbols, version);
    res.json({ ok: true, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/stock/regime/:symbol — 심볼별 레짐 히스토리
router.get('/regime/:symbol', async (req, res) => {
  try {
    const rows = await db.getRegimeHistory(req.params.symbol.toUpperCase());
    res.json({ symbol: req.params.symbol.toUpperCase(), regime: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/stock/regime/:symbol/current — 최근 레짐 상태
router.get('/regime/:symbol/current', async (req, res) => {
  try {
    const rows = await db.getRegimeHistory(req.params.symbol.toUpperCase());
    if (!rows.length) return res.json({ symbol: req.params.symbol, regime: null });
    const latest = rows[rows.length - 1];
    const LABELS = ['BEAR', 'NEUTRAL', 'BULL'];
    res.json({
      symbol: req.params.symbol.toUpperCase(),
      date: latest.date,
      state: latest.state,
      label: LABELS[latest.state] || 'UNKNOWN',
      prob_bull: latest.prob_bull,
      prob_neutral: latest.prob_neutral,
      prob_bear: latest.prob_bear,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/stock/predict — 예측 실행
router.post('/predict', async (req, res) => {
  const symbols = req.body?.symbols || COLLECT_SYMBOLS;
  const version = req.body?.version || 'v1';
  try {
    const { runPrediction } = require('../../jobs/predictor');
    const results = await runPrediction(symbols, version);
    res.json({ ok: true, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/stock/predict/:symbol — 최근 60일 예측 이력
router.get('/predict/:symbol', async (req, res) => {
  try {
    const rows = await db.getPredictionHistory(req.params.symbol.toUpperCase());
    res.json({ symbol: req.params.symbol.toUpperCase(), predictions: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/stock/predict/:symbol/current — 최신 예측
router.get('/predict/:symbol/current', async (req, res) => {
  try {
    const rows = await db.getPredictionHistory(req.params.symbol.toUpperCase(), 1);
    if (!rows.length) return res.json({ symbol: req.params.symbol.toUpperCase(), prediction: null });
    res.json({ symbol: req.params.symbol.toUpperCase(), prediction: rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = { router, collectSymbol, COLLECT_SYMBOLS };
