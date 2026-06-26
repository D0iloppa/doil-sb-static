// 시장 데이터 수집 cron — 매일 22:30 KST (13:30 UTC)
const cron = require('node-cron');
const { collectSymbol, COLLECT_SYMBOLS } = require('../routes/api/collect');
const db = require('../db/marketData');

let mmPost;
try {
  const svc = require('../mcp/services/mmService');
  mmPost = svc.postToChannel;
} catch {
  mmPost = null;
}

const CHANNEL_ID = process.env.MM_COLLECT_CHANNEL || process.env.MM_DEFAULT_CHANNEL || null;

async function runCollect() {
  const start = Date.now();
  console.log('[market-collect] 수집 시작', new Date().toISOString());
  const results = [];
  for (const sym of COLLECT_SYMBOLS) {
    try {
      const r = await collectSymbol(sym);
      await db.logCollect(sym, r.priceCount, 'ok', r.backfill ? 'backfill' : 'incremental');
      results.push({ ...r, status: 'ok' });
    } catch (e) {
      console.error(`[market-collect] ${sym} 실패:`, e.message);
      await db.logCollect(sym, 0, 'error', e.message);
      results.push({ symbol: sym, status: 'error', error: e.message });
    }
  }
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const ok = results.filter(r => r.status === 'ok').length;
  const err = results.filter(r => r.status === 'error');
  console.log(`[market-collect] 완료: ${ok}/${results.length} 성공, ${elapsed}s`);

  // 수집 후 피처 자동 계산
  try {
    const { runFeatureCalc } = require('./featureCalc');
    console.log('[market-collect] 피처 계산 시작...');
    const fResults = await runFeatureCalc();
    const fOk = fResults.filter(r => r.status === 'ok').length;
    console.log(`[market-collect] 피처 계산 완료: ${fOk}/${fResults.length}`);
  } catch (e) {
    console.error('[market-collect] 피처 계산 실패:', e.message);
  }

  // 피처 계산 후 HMM 레짐 감지
  try {
    const { runRegimeCalc } = require('./regimeCalc');
    console.log('[market-collect] HMM 레짐 계산 시작...');
    const rResults = await runRegimeCalc();
    const rOk = rResults.filter(r => r.status === 'ok').length;
    console.log(`[market-collect] 레짐 계산 완료: ${rOk}/${rResults.length}`);
  } catch (e) {
    console.error('[market-collect] 레짐 계산 실패:', e.message);
  }

  // 레짐 계산 후 예측 실행
  try {
    const { runPrediction } = require('./predictor');
    console.log('[market-collect] 예측 모델 실행 시작...');
    const pResults = await runPrediction();
    const pOk = pResults.filter(r => r.status === 'ok').length;
    console.log(`[market-collect] 예측 완료: ${pOk}/${pResults.length}`);
  } catch (e) {
    console.error('[market-collect] 예측 실패:', e.message);
  }

  if (err.length > 0 && mmPost && CHANNEL_ID) {
    const msg = `⚠️ market-collect 실패 (${err.length}건): ${err.map(r => r.symbol).join(', ')}`;
    mmPost(CHANNEL_ID, msg).catch(() => {});
  }
  return results;
}

function startCollectJob() {
  // 13:30 UTC = 22:30 KST
  cron.schedule('30 13 * * 1-5', async () => {
    try {
      await runCollect();
    } catch (e) {
      console.error('[market-collect] cron 오류:', e.message);
    }
  }, { timezone: 'UTC' });
  console.log('[market-collect] cron 등록: 평일 13:30 UTC (22:30 KST)');
}

module.exports = { startCollectJob, runCollect };
