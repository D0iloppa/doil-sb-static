// 레짐 조건부 예측 — 로지스틱 회귀(방향) + 선형 회귀(수익률)
// 3개 레짐별 독립 모델. features_daily + regime_state → 다음 거래일 예측
const db = require('../db/marketData');
const { COLLECT_SYMBOLS } = require('../routes/api/collect');

// ── 수학 유틸 ──────────────────────────────────────────────
function dot(w, x) {
  let s = 0;
  for (let i = 0; i < w.length; i++) s += w[i] * x[i];
  return s;
}
function sigmoid(z) { return 1 / (1 + Math.exp(-z)); }

// 피처 추출 (null 있으면 0으로 대체)
function toVec(row) {
  return [
    1,                                           // bias
    row.ret_1d   != null ? +row.ret_1d   : 0,
    row.ret_5d   != null ? +row.ret_5d   : 0,
    row.ret_20d  != null ? +row.ret_20d  : 0,
    row.vol_20d  != null ? +row.vol_20d  : 0,
    row.vol_60d  != null ? +row.vol_60d  : 0,
    row.volume_ratio != null ? +row.volume_ratio : 1,
    row.rsi_14   != null ? +row.rsi_14 / 100 : 0.5,  // 정규화 [0,1]
    row.macd     != null ? +row.macd     : 0,
    row.bb_position != null ? +row.bb_position : 0.5,
  ];
}

// ── 로지스틱 회귀 (경사하강법) ─────────────────────────────
function trainLogistic(X, y, lr = 0.05, iters = 200) {
  const D = X[0].length;
  const w = new Array(D).fill(0);
  const N = X.length;
  for (let it = 0; it < iters; it++) {
    const grad = new Array(D).fill(0);
    for (let i = 0; i < N; i++) {
      const p = sigmoid(dot(w, X[i]));
      const err = p - y[i];
      for (let d = 0; d < D; d++) grad[d] += err * X[i][d];
    }
    // L2 정규화
    for (let d = 1; d < D; d++) {
      w[d] -= lr * (grad[d] / N + 0.01 * w[d]);
    }
    w[0] -= lr * grad[0] / N;
  }
  return w;
}

// ── 선형 회귀 (정규방정식 — 작은 D에서 충분) ─────────────────
function trainLinear(X, y) {
  const D = X[0].length;
  const N = X.length;
  // XtX + λI
  const lambda = 0.001;
  const XtX = Array.from({ length: D }, () => new Array(D).fill(0));
  const Xty = new Array(D).fill(0);
  for (let i = 0; i < N; i++) {
    for (let d = 0; d < D; d++) {
      Xty[d] += X[i][d] * y[i];
      for (let e = 0; e < D; e++) XtX[d][e] += X[i][d] * X[i][e];
    }
  }
  for (let d = 0; d < D; d++) XtX[d][d] += lambda;
  return solveLinear(XtX, Xty);
}

// ガウス消去 (Gauss elimination) — 작은 D(10)이라 괜찮음
function solveLinear(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[maxRow][col])) maxRow = r;
    }
    [M[col], M[maxRow]] = [M[maxRow], M[col]];
    const pivot = M[col][col];
    if (Math.abs(pivot) < 1e-12) continue;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / pivot;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
    for (let c = col; c <= n; c++) M[col][c] /= pivot;
  }
  return M.map(row => row[n]);
}

// ── 레짐별 모델 학습 ──────────────────────────────────────
function trainModels(rows) {
  // rows[i] → 예측 대상 labels: rows[i+1] 기준
  const byRegime = [[], [], []]; // 0=Bear, 1=Neutral, 2=Bull

  for (let i = 0; i < rows.length - 1; i++) {
    const cur = rows[i];
    const nxt = rows[i + 1];
    const regime = Number(cur.regime_state);
    if (regime < 0 || regime > 2) continue;

    const x = toVec(cur);
    const ret1dNext = nxt.ret_1d != null ? +nxt.ret_1d : null;
    const ret5dNext = nxt.ret_5d != null ? +nxt.ret_5d : null;
    const ret20dNext = nxt.ret_20d != null ? +nxt.ret_20d : null;
    if (ret1dNext == null) continue;

    byRegime[regime].push({
      x,
      yDir: ret1dNext > 0 ? 1 : 0,
      y5d: ret5dNext ?? 0,
      y20d: ret20dNext ?? 0,
    });
  }

  const models = [];
  for (let r = 0; r < 3; r++) {
    const data = byRegime[r];
    if (data.length < 20) {
      // 데이터 부족 시 전체로 fallback
      const all = byRegime.flat();
      models.push(all.length >= 20 ? fitModel(all) : null);
    } else {
      models.push(fitModel(data));
    }
  }
  return models;
}

function fitModel(data) {
  const X = data.map(d => d.x);
  const yDir = data.map(d => d.yDir);
  const y5d = data.map(d => d.y5d);
  const y20d = data.map(d => d.y20d);
  return {
    wDir: trainLogistic(X, yDir),
    w5d: trainLinear(X, y5d),
    w20d: trainLinear(X, y20d),
  };
}

// ── 단일 심볼 예측 ─────────────────────────────────────────
function toDateStr(v) {
  return (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);
}

async function predictSymbol(symbol, model_version = 'v1') {
  const rows = await db.getFeaturesWithRegime(symbol);
  if (rows.length < 100) return { symbol, count: 0, note: 'insufficient data' };

  const models = trainModels(rows);

  // 최근 N일 예측 (학습 데이터 제외 — 마지막 60일)
  const PREDICT_WINDOW = 60;
  const startIdx = Math.max(rows.length - PREDICT_WINDOW, 60);
  const preds = [];

  for (let i = startIdx; i < rows.length; i++) {
    const cur = rows[i];
    const regime = Number(cur.regime_state ?? 1);
    const model = models[regime] || models[1]; // fallback to neutral
    if (!model) continue;

    const x = toVec(cur);
    const upProb = sigmoid(dot(model.wDir, x));
    const ret5d = dot(model.w5d, x);
    const ret20d = dot(model.w20d, x);

    preds.push({
      symbol,
      date: toDateStr(cur.date),
      regime_state: regime,
      pred_up_prob: +upProb.toFixed(4),
      pred_ret_5d: +ret5d.toFixed(6),
      pred_ret_20d: +ret20d.toFixed(6),
    });
  }

  if (preds.length) await db.upsertPrediction(preds, model_version);
  return { symbol, count: preds.length };
}

async function runPrediction(symbols, model_version = 'v1') {
  await db.ensurePredictionsTable();
  const targets = symbols || COLLECT_SYMBOLS;
  const results = [];
  for (const sym of targets) {
    try {
      const r = await predictSymbol(sym, model_version);
      results.push({ ...r, status: 'ok' });
    } catch (e) {
      console.error(`[predictor] ${sym} 실패:`, e.message);
      results.push({ symbol: sym, status: 'error', error: e.message });
    }
  }
  return results;
}

module.exports = { runPrediction, predictSymbol };
