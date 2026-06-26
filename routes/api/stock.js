const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const configPath = path.join(__dirname, '../../mcp/config.yml');
const config = fs.existsSync(configPath) ? yaml.load(fs.readFileSync(configPath, 'utf8')) : {};
const FINNHUB_KEY = config?.finnhub?.api_key || process.env.FINNHUB_KEY;

const YAHOO_BASE = 'https://query2.finance.yahoo.com';
const NAVER_AC = 'https://ac.stock.naver.com/ac';
const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const WATCHLIST_PATH = path.join(__dirname, '../../data/watchlist.json');

const isKR = (symbol) => /^\d{6}$/.test(symbol);
const KS = (s) => `${s}.KS`;
const KQ = (s) => `${s}.KQ`;

const HTML_ENTITIES = { quot:'"', amp:'&', apos:"'", lt:'<', gt:'>', nbsp:' ', copy:'©', reg:'®',
  mdash:'—', ndash:'–', hellip:'…', ldquo:'“', rdquo:'”', lsquo:'‘', rsquo:'’',
  laquo:'«', raquo:'»', middot:'·', bull:'•', trade:'™', acute:'´', grave:'`' };
function decodeHtmlEntities(str) {
  return str
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (m, name) => HTML_ENTITIES[name.toLowerCase()] ?? m);
}

async function fetchJson(url, headers = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', ...headers },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

async function yahooChart(symbol, params) {
  const qs = new URLSearchParams(params).toString();
  try {
    const d = await fetchJson(`${YAHOO_BASE}/v8/finance/chart/${KS(symbol)}?${qs}`);
    if (d.chart?.result?.[0]) return { data: d.chart.result[0], exchange: 'KS' };
    throw new Error('no result');
  } catch {
    const d = await fetchJson(`${YAHOO_BASE}/v8/finance/chart/${KQ(symbol)}?${qs}`);
    if (!d.chart?.result?.[0]) throw new Error('Symbol not found');
    return { data: d.chart.result[0], exchange: 'KQ' };
  }
}

async function yahooChartUS(symbol, params) {
  const qs = new URLSearchParams(params).toString();
  const encoded = encodeURIComponent(symbol);
  const d = await fetchJson(`${YAHOO_BASE}/v8/finance/chart/${encoded}?${qs}`);
  if (!d.chart?.result?.[0]) throw new Error('Symbol not found');
  return d.chart.result[0];
}

function readWatchlist() {
  try { return JSON.parse(fs.readFileSync(WATCHLIST_PATH, 'utf8')); }
  catch { return { items: [] }; }
}

function writeWatchlist(data) {
  fs.writeFileSync(WATCHLIST_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function pearson(x, y) {
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my);
    dx2 += (x[i] - mx) ** 2;
    dy2 += (y[i] - my) ** 2;
  }
  return dx2 && dy2 ? num / Math.sqrt(dx2 * dy2) : 0;
}

// GET /api/stock/quote/:symbol
router.get('/quote/:symbol', async (req, res) => {
  const { symbol } = req.params;
  try {
    if (isKR(symbol)) {
      const { data: q } = await yahooChart(symbol, { range: '1d', interval: '5m', includePrePost: false });
      const meta = q.meta;
      const price = meta.regularMarketPrice;
      const prevClose = meta.previousClose || meta.chartPreviousClose;
      const change = prevClose ? price - prevClose : null;
      const changePct = prevClose ? (change / prevClose) * 100 : null;
      return res.json({
        symbol, market: 'KR',
        name: meta.longName || meta.shortName || symbol,
        price, prevClose, change, changePct,
        open: meta.regularMarketOpen,
        high: meta.regularMarketDayHigh,
        low: meta.regularMarketDayLow,
        high52w: meta.fiftyTwoWeekHigh || null,
        low52w: meta.fiftyTwoWeekLow || null,
        volume: meta.regularMarketVolume,
        marketCap: null, pe: null, divYield: null,
        currency: meta.currency || 'KRW',
      });
    } else {
      const [qt, profile] = await Promise.all([
        fetchJson(`${FINNHUB_BASE}/quote?symbol=${symbol}&token=${FINNHUB_KEY}`),
        fetchJson(`${FINNHUB_BASE}/stock/profile2?symbol=${symbol}&token=${FINNHUB_KEY}`),
      ]);
      return res.json({
        symbol, market: 'US',
        name: profile.name || symbol,
        price: qt.c, prevClose: qt.pc, change: qt.d, changePct: qt.dp,
        open: qt.o, high: qt.h, low: qt.l,
        high52w: null, low52w: null, volume: null,
        marketCap: profile.marketCapitalization ? profile.marketCapitalization * 1e6 : null,
        pe: null, divYield: null,
        currency: profile.currency || 'USD',
      });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/stock/candle/:symbol?range=1mo
router.get('/candle/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const range = req.query.range || '1mo';
  const intervalMap = { '1d': '5m', '5d': '30m', '1mo': '1d', '3mo': '1d', '1y': '1wk' };
  const interval = intervalMap[range] || '1d';
  try {
    if (isKR(symbol)) {
      const { data: result } = await yahooChart(symbol, { range, interval, includePrePost: false });
      const { timestamp, indicators } = result;
      const q = indicators.quote[0];
      const candles = timestamp.map((t, i) => ({
        time: t, open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume[i],
      })).filter(c => c.open != null && c.close != null);
      return res.json({ symbol, market: 'KR', candles });
    } else {
      const result = await yahooChartUS(symbol, { range, interval, includePrePost: false });
      const { timestamp, indicators } = result;
      const q = indicators.quote[0];
      const candles = timestamp.map((t, i) => ({
        time: t, open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume[i],
      })).filter(c => c.open != null && c.close != null);
      return res.json({ symbol, market: 'US', candles });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/stock/longterm/:symbol?years=10
router.get('/longterm/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const years = parseInt(req.query.years) || 10;
  const range = years <= 5 ? '5y' : '10y';
  try {
    const params = { range, interval: '1mo', includeAdjustedClose: true };
    let result;
    if (isKR(symbol)) {
      const r = await yahooChart(symbol, params);
      result = r.data;
    } else {
      result = await yahooChartUS(symbol, params);
    }
    const { timestamp, indicators, meta } = result;
    const adj = indicators.adjclose?.[0]?.adjclose || indicators.quote[0].close;
    const q = indicators.quote[0];
    const candles = timestamp.map((t, i) => ({
      time: t,
      open: q.open[i] ?? adj[i],
      high: q.high[i] ?? adj[i],
      low: q.low[i] ?? adj[i],
      close: adj[i] ?? q.close[i],
      volume: q.volume[i],
    })).filter(c => c.close != null);
    return res.json({ symbol, market: isKR(symbol) ? 'KR' : 'US', years, currency: meta?.currency, candles });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/stock/dividends/:symbol?range=10y
router.get('/dividends/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const range = req.query.range || '10y';
  try {
    const params = { range, interval: '1mo', events: 'div' };
    let result;
    if (isKR(symbol)) {
      const r = await yahooChart(symbol, params);
      result = r.data;
    } else {
      result = await yahooChartUS(symbol, params);
    }
    const events = result.events?.dividends || {};
    const divs = Object.values(events)
      .sort((a, b) => a.date - b.date)
      .map(d => ({ date: d.date, amount: d.amount }));
    return res.json({ symbol, dividends: divs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/stock/fundamentals/:symbol
router.get('/fundamentals/:symbol', async (req, res) => {
  const { symbol } = req.params;
  try {
    if (isKR(symbol)) {
      const ySym = KS(symbol);
      const data = await fetchJson(
        `${YAHOO_BASE}/v10/finance/quoteSummary/${ySym}?modules=defaultKeyStatistics,financialData,summaryDetail`
      );
      const s = data.quoteSummary?.result?.[0];
      if (!s) return res.status(404).json({ error: 'No data' });
      const ks = s.defaultKeyStatistics || {};
      const fd = s.financialData || {};
      const sd = s.summaryDetail || {};
      return res.json({
        symbol, market: 'KR',
        pe: sd.trailingPE?.raw ?? null,
        forwardPe: sd.forwardPE?.raw ?? null,
        pb: ks.priceToBook?.raw ?? null,
        ps: ks.priceToSalesTrailing12Months?.raw ?? null,
        roe: fd.returnOnEquity?.raw != null ? fd.returnOnEquity.raw * 100 : null,
        roa: fd.returnOnAssets?.raw != null ? fd.returnOnAssets.raw * 100 : null,
        operatingMargin: fd.operatingMargins?.raw != null ? fd.operatingMargins.raw * 100 : null,
        profitMargin: fd.profitMargins?.raw != null ? fd.profitMargins.raw * 100 : null,
        debtToEquity: fd.debtToEquity?.raw ?? null,
        currentRatio: fd.currentRatio?.raw ?? null,
        eps: ks.trailingEps?.raw ?? null,
        divYield: sd.dividendYield?.raw != null ? sd.dividendYield.raw * 100 : null,
        beta: ks.beta?.raw ?? null,
        marketCap: sd.marketCap?.raw ?? null,
      });
    } else {
      const data = await fetchJson(
        `${FINNHUB_BASE}/stock/metric?symbol=${symbol}&metric=all&token=${FINNHUB_KEY}`
      );
      const m = data.metric || {};
      return res.json({
        symbol, market: 'US',
        pe: m.peNormalizedAnnual ?? m.peTTM ?? null,
        forwardPe: m.peExclExtraTTM ?? null,
        pb: m.pbAnnual ?? m.pbQuarterly ?? null,
        ps: m.psTTM ?? null,
        roe: m.roeTTM ?? null,
        roa: m.roaTTM ?? null,
        operatingMargin: m.operatingMarginAnnual ?? null,
        profitMargin: m.netProfitMarginAnnual ?? null,
        debtToEquity: m.totalDebt_totalEquityAnnual ?? null,
        currentRatio: m.currentRatioAnnual ?? null,
        eps: m.epsNormalizedAnnual ?? m.epsTTM ?? null,
        divYield: m.dividendYieldIndicatedAnnual ?? null,
        beta: m.beta ?? null,
        marketCap: null,
        revenueGrowth3y: m.revenueGrowth3Y ?? null,
        epsGrowth3y: m.epsGrowth3Y ?? null,
      });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/stock/correlation?symbols=SPY,QQQ,GLD&period=2y
router.get('/correlation', async (req, res) => {
  const symbols = (req.query.symbols || 'SPY,QQQ,GLD,BND').split(',').slice(0, 6).map(s => s.trim());
  const period = req.query.period || '2y';
  try {
    const seriesMap = {};
    await Promise.all(symbols.map(async sym => {
      try {
        let result;
        if (isKR(sym)) {
          const r = await yahooChart(sym, { range: period, interval: '1mo', includeAdjustedClose: true });
          result = r.data;
        } else {
          result = await yahooChartUS(sym, { range: period, interval: '1mo', includeAdjustedClose: true });
        }
        const adj = result.indicators?.adjclose?.[0]?.adjclose || result.indicators?.quote[0]?.close || [];
        const returns = [];
        for (let i = 1; i < adj.length; i++) {
          if (adj[i] != null && adj[i - 1] != null && adj[i - 1] !== 0) {
            returns.push((adj[i] - adj[i - 1]) / adj[i - 1]);
          }
        }
        seriesMap[sym] = returns;
      } catch { seriesMap[sym] = null; }
    }));
    const valid = symbols.filter(s => seriesMap[s]?.length > 2);
    const minLen = Math.min(...valid.map(s => seriesMap[s].length));
    const matrix = {};
    for (const a of valid) {
      matrix[a] = {};
      const xa = seriesMap[a].slice(-minLen);
      for (const b of valid) {
        matrix[a][b] = parseFloat(pearson(xa, seriesMap[b].slice(-minLen)).toFixed(4));
      }
    }
    return res.json({ symbols: valid, matrix, period });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/stock/etf-snapshot
const ETF_BASKET = ['SPY', 'QQQ', 'VT', 'BND', 'TLT', 'GLD', '^VIX'];
router.get('/etf-snapshot', async (req, res) => {
  try {
    const results = await Promise.allSettled(ETF_BASKET.map(async sym => {
      const result = await yahooChartUS(sym, { range: '1d', interval: '1d' });
      const meta = result.meta;
      const prev = meta.previousClose || meta.chartPreviousClose || meta.regularMarketPrice;
      const price = meta.regularMarketPrice;
      return {
        symbol: sym,
        name: meta.longName || meta.shortName || sym,
        price,
        change: price - prev,
        changePct: prev ? ((price - prev) / prev) * 100 : 0,
        currency: meta.currency || 'USD',
      };
    }));
    const snapshot = results.filter(r => r.status === 'fulfilled').map(r => r.value);
    return res.json({ snapshot });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/stock/watchlist
router.get('/watchlist', (req, res) => {
  res.json(readWatchlist());
});

// POST /api/stock/watchlist
router.post('/watchlist', express.json(), (req, res) => {
  const { symbol, name, market } = req.body || {};
  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  const wl = readWatchlist();
  if (!wl.items.find(i => i.symbol === symbol)) {
    wl.items.push({ symbol, name: name || symbol, market: market || (isKR(symbol) ? 'KR' : 'US') });
    writeWatchlist(wl);
  }
  res.json(wl);
});

// DELETE /api/stock/watchlist/:symbol
router.delete('/watchlist/:symbol', (req, res) => {
  const { symbol } = req.params;
  const wl = readWatchlist();
  wl.items = wl.items.filter(i => i.symbol !== symbol);
  writeWatchlist(wl);
  res.json(wl);
});

// GET /api/stock/search?q=삼성&market=KR
router.get('/search', async (req, res) => {
  const { q, market } = req.query;
  if (!q) return res.json({ results: [] });
  try {
    if (market === 'US') {
      const data = await fetchJson(`${FINNHUB_BASE}/search?q=${encodeURIComponent(q)}&token=${FINNHUB_KEY}`);
      return res.json({
        results: (data.result || []).slice(0, 10).map(r => ({
          symbol: r.symbol, name: r.description, market: 'US', type: r.type,
        })),
      });
    } else {
      if (/^\d{6}$/.test(q.trim())) {
        return res.json({ results: [{ symbol: q.trim(), name: q.trim(), market: 'KR' }] });
      }
      const data = await fetchJson(
        `${NAVER_AC}?q=${encodeURIComponent(q)}&target=stock,index,marketindicator`,
        { Referer: 'https://finance.naver.com/' }
      );
      const items = (data.items || []).filter(i => i.nationCode === 'KOR' && i.category === 'stock' && /^\d{6}$/.test(i.code));
      return res.json({
        results: items.slice(0, 10).map(r => ({
          symbol: r.code, name: r.name, market: 'KR',
          exchange: r.typeCode === 'KOSDAQ' ? 'KOE' : 'KSC',
        })),
      });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/stock/news/:symbol?market=KR|US
router.get('/news/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const market = req.query.market || (isKR(symbol) ? 'KR' : 'US');
  try {
    if (market === 'US') {
      const to = new Date().toISOString().slice(0, 10);
      const from = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const data = await fetchJson(
        `${FINNHUB_BASE}/company-news?symbol=${symbol}&from=${from}&to=${to}&token=${FINNHUB_KEY}`
      );
      const items = Array.isArray(data) ? data.slice(0, 10) : [];
      return res.json({
        symbol, market: 'US',
        news: items.map(n => ({
          title: n.headline, source: n.source, url: n.url, time: n.datetime, summary: n.summary?.slice(0, 120),
        })),
      });
    } else {
      // 네이버 증권 뉴스 fetch (KR)
      const code = symbol; // 6자리 종목코드
      const url = `https://finance.naver.com/item/news_news.naver?code=${code}`;
      const htmlRes = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'ko-KR,ko;q=0.9',
          'Referer': 'https://finance.naver.com',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!htmlRes.ok) return res.json({ symbol, market: 'KR', news: [] });

      const buf = Buffer.from(await htmlRes.arrayBuffer());
      const ct = htmlRes.headers.get('content-type') || '';
      const isEucKr = ct.toLowerCase().includes('euc-kr');
      const html = isEucKr
        ? new TextDecoder('euc-kr').decode(buf)
        : buf.toString('utf-8');

      // 뉴스 항목 파싱: href + 제목 + 날짜
      const items = [];
      const linkRe = /href="(\/item\/news_read\.naver[^"]+)"[^>]*class="tit"[^>]*>([\s\S]*?)<\/a>/g;
      const dateRe = /<td class="date">\s*([^<]+?)\s*<\/td>/g;
      const dates = [];
      let dm; while ((dm = dateRe.exec(html)) !== null) dates.push(dm[1].trim());

      let m; let idx = 0;
      while ((m = linkRe.exec(html)) !== null && items.length < 10) {
        const href = `https://finance.naver.com${m[1]}`;
        const title = decodeHtmlEntities(m[2].replace(/<[^>]+>/g, '').trim());
        if (!title) continue;
        items.push({ title, url: href, source: '네이버증권', time: dates[idx] || null, summary: null });
        idx++;
      }
      return res.json({ symbol, market: 'KR', news: items });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const INSIGHT_CONFIG_PATH = path.join(__dirname, '../../insight_config.json');

// POST /api/stock/ai-insight — ETF 스냅샷 기반 DOBIS(claude) 시장 인사이트
// 모델·프롬프트는 insight_config.json에서 읽어 hot-edit 가능 (재배포 불필요)
router.post('/ai-insight', express.json(), async (req, res) => {
  const { dobisQuery } = require('../../dobisBridge');

  const { snapshot } = req.body || {};
  if (!Array.isArray(snapshot) || snapshot.length === 0) {
    return res.status(400).json({ error: 'snapshot 데이터 필요' });
  }

  let cfg = { model: 'haiku', prompt_template: '다음은 오늘의 ETF 시장 스냅샷입니다:\n{snapshot}\n\n2-3문단으로 간결하게 한국어로 분석해주세요.' };
  try { cfg = JSON.parse(fs.readFileSync(INSIGHT_CONFIG_PATH, 'utf8')); } catch { /* 파일 없으면 기본값 */ }

  const lines = snapshot.map(s => {
    const dir = s.changePct >= 0 ? '+' : '';
    return `  ${s.symbol} (${s.name}): $${Number(s.price).toFixed(2)}, ${dir}${Number(s.changePct).toFixed(2)}%`;
  }).join('\n');

  const prompt = (cfg.prompt_template || '').replace('{snapshot}', lines);

  try {
    const text = await dobisQuery(prompt, cfg.model || 'haiku', 40000);
    res.json({ insight: text });
  } catch (e) {
    res.status(503).json({ error: e.message });
  }
});

module.exports = router;
