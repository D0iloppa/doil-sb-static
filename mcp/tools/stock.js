const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const configPath = path.join(__dirname, '..', 'config.yml');
const config = fs.existsSync(configPath) ? yaml.load(fs.readFileSync(configPath, 'utf8')) : {};
const FINNHUB_KEY = config?.finnhub?.api_key || process.env.FINNHUB_KEY;

const YAHOO_BASE = 'https://query2.finance.yahoo.com';
const FINNHUB_BASE = 'https://finnhub.io/api/v1';

const isKR = (s) => /^\d{6}$/.test(s);
const toYahoo = (s) => `${s}.KS`;

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const tools = [
  {
    name: 'stock_quote',
    description: '주식 현재가 조회. symbol: KR=6자리 숫자(삼성전자→005930), US=티커(AAPL)',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: '종목 코드 (KR: 005930, US: AAPL)' },
      },
      required: ['symbol'],
    },
    handler: async ({ symbol }) => {
      if (isKR(symbol)) {
        const data = await fetchJson(
          `${YAHOO_BASE}/v8/finance/chart/${toYahoo(symbol)}?range=1d&interval=5m`
        );
        const meta = data.chart?.result?.[0]?.meta;
        if (!meta) return '종목을 찾을 수 없습니다.';
        const change = meta.regularMarketPrice - meta.previousClose;
        const pct = (change / meta.previousClose * 100).toFixed(2);
        return `[KR] ${meta.longName || symbol} (${symbol})\n현재가: ${meta.regularMarketPrice.toLocaleString()}원\n전일대비: ${change > 0 ? '+' : ''}${change.toLocaleString()} (${pct}%)\n고가: ${meta.regularMarketDayHigh?.toLocaleString()} / 저가: ${meta.regularMarketDayLow?.toLocaleString()}`;
      } else {
        const [qt, profile] = await Promise.all([
          fetchJson(`${FINNHUB_BASE}/quote?symbol=${symbol}&token=${FINNHUB_KEY}`),
          fetchJson(`${FINNHUB_BASE}/stock/profile2?symbol=${symbol}&token=${FINNHUB_KEY}`),
        ]);
        return `[US] ${profile.name || symbol} (${symbol})\n현재가: $${qt.c}\n전일대비: ${qt.d > 0 ? '+' : ''}${qt.d?.toFixed(2)} (${qt.dp?.toFixed(2)}%)\n고가: $${qt.h} / 저가: $${qt.l}`;
      }
    },
  },
  {
    name: 'stock_search',
    description: '주식 종목 검색. market: KR 또는 US',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '검색어 (종목명 또는 코드)' },
        market: { type: 'string', enum: ['KR', 'US'], description: '시장 (KR 또는 US)' },
      },
      required: ['query', 'market'],
    },
    handler: async ({ query, market }) => {
      if (market === 'US') {
        const data = await fetchJson(
          `${FINNHUB_BASE}/search?q=${encodeURIComponent(query)}&token=${FINNHUB_KEY}`
        );
        const results = (data.result || []).slice(0, 5);
        if (!results.length) return '검색 결과가 없습니다.';
        return results.map(r => `${r.symbol}: ${r.description}`).join('\n');
      } else {
        const data = await fetchJson(
          `${YAHOO_BASE}/v1/finance/search?q=${encodeURIComponent(query)}&lang=ko-KR&region=KR&quotesCount=10&newsCount=0`
        );
        const quotes = (data.quotes || []).filter(q => q.exchange?.includes('KSC')).slice(0, 5);
        if (!quotes.length) return '검색 결과가 없습니다.';
        return quotes.map(r => `${r.symbol?.replace('.KS', '')}: ${r.longname || r.shortname}`).join('\n');
      }
    },
  },
  {
    name: 'stock_chart',
    description: '주식 차트 데이터(OHLCV) 조회. range: 1d/5d/1mo/3mo/1y',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: '종목 코드' },
        range: { type: 'string', enum: ['1d', '5d', '1mo', '3mo', '1y'], description: '기간' },
      },
      required: ['symbol'],
    },
    handler: async ({ symbol, range = '1mo' }) => {
      if (isKR(symbol)) {
        const data = await fetchJson(
          `${YAHOO_BASE}/v8/finance/chart/${toYahoo(symbol)}?range=${range}&interval=1d`
        );
        const result = data.chart?.result?.[0];
        if (!result) return '데이터 없음';
        const { timestamp, indicators } = result;
        const q = indicators.quote[0];
        const last5 = timestamp.slice(-5).map((t, i) => {
          const idx = timestamp.length - 5 + i;
          const date = new Date(t * 1000).toLocaleDateString('ko-KR');
          return `${date}: 시${q.open[idx]?.toLocaleString()} 고${q.high[idx]?.toLocaleString()} 저${q.low[idx]?.toLocaleString()} 종${q.close[idx]?.toLocaleString()}`;
        });
        return `[KR] ${symbol} 최근 ${range} 차트 (마지막 5봉)\n${last5.join('\n')}`;
      } else {
        // Finnhub /stock/candle은 유료 전용 → Yahoo Finance 사용 (US 및 글로벌 시장 지원)
        const intervalMap = { '1d': '5m', '5d': '30m', '1mo': '1d', '3mo': '1d', '1y': '1wk' };
        const interval = intervalMap[range] || '1d';
        const data = await fetchJson(
          `${YAHOO_BASE}/v8/finance/chart/${symbol}?range=${range}&interval=${interval}`
        );
        const result = data.chart?.result?.[0];
        if (!result) return '데이터 없음';
        const { timestamp, indicators, meta } = result;
        const q = indicators.quote[0];
        const currency = meta?.currency || 'USD';
        const last5 = timestamp.slice(-5).map((t, i) => {
          const idx = timestamp.length - 5 + i;
          const date = new Date(t * 1000).toLocaleDateString('ko-KR');
          return `${date}: O${q.open[idx]?.toFixed(2)} H${q.high[idx]?.toFixed(2)} L${q.low[idx]?.toFixed(2)} C${q.close[idx]?.toFixed(2)}`;
        });
        return `[${currency}] ${symbol} 최근 ${range} 차트 (마지막 5봉)\n${last5.join('\n')}`;
      }
    },
  },
  {
    name: 'stock_longterm',
    description: '장기 조정주가(adjusted close) 조회. 10~20년 월봉 데이터. 랜덤워크 분석용.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: '종목 코드 (KR: 005930, US: SPY)' },
        years: { type: 'number', description: '조회 기간(년). 기본값 10', default: 10 },
      },
      required: ['symbol'],
    },
    handler: async ({ symbol, years = 10 }) => {
      const data = await fetchJson(
        `${YAHOO_BASE}/v8/finance/chart/${encodeURIComponent(isKR(symbol) ? `${symbol}.KS` : symbol)}?range=${years <= 5 ? '5y' : '10y'}&interval=1mo&includeAdjustedClose=true`
      );
      const result = data.chart?.result?.[0];
      if (!result) return '데이터 없음';
      const { timestamp, indicators } = result;
      const adj = indicators.adjclose?.[0]?.adjclose || indicators.quote[0].close;
      const first = adj.find(v => v != null);
      const last = adj.filter(v => v != null).at(-1);
      const totalReturn = first && last ? ((last - first) / first * 100).toFixed(1) : null;
      const sample = timestamp.filter((_, i) => adj[i] != null).filter((_, i, a) => i % Math.max(1, Math.floor(a.length / 6)) === 0).slice(0, 6);
      const lines = sample.map(t => {
        const i = timestamp.indexOf(t);
        const date = new Date(t * 1000).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short' });
        return `${date}: ${isKR(symbol) ? `₩${adj[i]?.toLocaleString()}` : `$${adj[i]?.toFixed(2)}`}`;
      });
      return `[장기/조정주가] ${symbol} 최근 ${years}년\n${lines.join('\n')}\n총수익률: ${totalReturn ? `${totalReturn > 0 ? '+' : ''}${totalReturn}%` : '--'}`;
    },
  },
  {
    name: 'stock_dividends',
    description: '배당 이력 조회. 최근 10년 배당금 내역.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: '종목 코드' },
      },
      required: ['symbol'],
    },
    handler: async ({ symbol }) => {
      const ySym = isKR(symbol) ? `${symbol}.KS` : symbol;
      const data = await fetchJson(
        `${YAHOO_BASE}/v8/finance/chart/${encodeURIComponent(ySym)}?range=10y&interval=1mo&events=div`
      );
      const result = data.chart?.result?.[0];
      if (!result) return '데이터 없음';
      const events = result.events?.dividends || {};
      const divs = Object.values(events).sort((a, b) => b.date - a.date).slice(0, 12);
      if (!divs.length) return `${symbol}: 배당 이력 없음`;
      const lines = divs.map(d => {
        const date = new Date(d.date * 1000).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short' });
        return `${date}: ${isKR(symbol) ? `₩${d.amount?.toLocaleString()}` : `$${d.amount?.toFixed(4)}`}`;
      });
      return `[배당 이력] ${symbol} (최근 12건)\n${lines.join('\n')}`;
    },
  },
  {
    name: 'stock_fundamentals',
    description: 'PER/PBR/ROE 등 기본 재무지표 조회.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: '종목 코드' },
      },
      required: ['symbol'],
    },
    handler: async ({ symbol }) => {
      let data;
      if (isKR(symbol)) {
        const d = await fetchJson(
          `${YAHOO_BASE}/v10/finance/quoteSummary/${symbol}.KS?modules=defaultKeyStatistics,financialData,summaryDetail`
        );
        const s = d.quoteSummary?.result?.[0];
        if (!s) return '데이터 없음';
        const ks = s.defaultKeyStatistics || {};
        const fd = s.financialData || {};
        const sd = s.summaryDetail || {};
        data = {
          pe: sd.trailingPE?.raw, pb: ks.priceToBook?.raw,
          roe: fd.returnOnEquity?.raw != null ? (fd.returnOnEquity.raw * 100).toFixed(1) : null,
          roa: fd.returnOnAssets?.raw != null ? (fd.returnOnAssets.raw * 100).toFixed(1) : null,
          margin: fd.profitMargins?.raw != null ? (fd.profitMargins.raw * 100).toFixed(1) : null,
          de: fd.debtToEquity?.raw, beta: ks.beta?.raw,
          divYield: sd.dividendYield?.raw != null ? (sd.dividendYield.raw * 100).toFixed(2) : null,
        };
      } else {
        const d = await fetchJson(`${FINNHUB_BASE}/stock/metric?symbol=${symbol}&metric=all&token=${FINNHUB_KEY}`);
        const m = d.metric || {};
        data = {
          pe: m.peNormalizedAnnual ?? m.peTTM, pb: m.pbAnnual ?? m.pbQuarterly,
          roe: m.roeTTM?.toFixed(1), roa: m.roaTTM?.toFixed(1),
          margin: m.netProfitMarginAnnual?.toFixed(1), de: m.totalDebt_totalEquityAnnual,
          beta: m.beta, divYield: m.dividendYieldIndicatedAnnual?.toFixed(2),
        };
      }
      const f = (v, suffix = '') => v != null ? `${Number(v).toFixed(2)}${suffix}` : '--';
      return `[재무지표] ${symbol}\nPER: ${f(data.pe, 'x')} | PBR: ${f(data.pb, 'x')} | 배당수익률: ${data.divYield ? `${data.divYield}%` : '--'}\nROE: ${data.roe ? `${data.roe}%` : '--'} | ROA: ${data.roa ? `${data.roa}%` : '--'} | 순이익률: ${data.margin ? `${data.margin}%` : '--'}\n부채비율: ${f(data.de)} | 베타: ${f(data.beta)}`;
    },
  },
  {
    name: 'stock_correlation',
    description: '복수 자산 간 상관계수 행렬 계산. 월별 수익률 기준 Pearson 상관.',
    inputSchema: {
      type: 'object',
      properties: {
        symbols: { type: 'string', description: '콤마 구분 티커 (예: SPY,QQQ,GLD,BND)' },
        period: { type: 'string', description: '기간 (2y/5y 등). 기본값 2y', default: '2y' },
      },
      required: ['symbols'],
    },
    handler: async ({ symbols, period = '2y' }) => {
      const syms = symbols.split(',').map(s => s.trim()).slice(0, 5);
      const seriesMap = {};
      await Promise.all(syms.map(async sym => {
        try {
          const encoded = encodeURIComponent(isKR(sym) ? `${sym}.KS` : sym);
          const d = await fetchJson(`${YAHOO_BASE}/v8/finance/chart/${encoded}?range=${period}&interval=1mo&includeAdjustedClose=true`);
          const result = d.chart?.result?.[0];
          const adj = result?.indicators?.adjclose?.[0]?.adjclose || result?.indicators?.quote[0]?.close || [];
          const returns = [];
          for (let i = 1; i < adj.length; i++) {
            if (adj[i] != null && adj[i - 1] != null && adj[i - 1] !== 0) returns.push((adj[i] - adj[i - 1]) / adj[i - 1]);
          }
          seriesMap[sym] = returns.length > 2 ? returns : null;
        } catch { seriesMap[sym] = null; }
      }));
      const valid = syms.filter(s => seriesMap[s]);
      if (valid.length < 2) return '유효한 데이터가 부족합니다 (최소 2개 종목 필요)';
      const minLen = Math.min(...valid.map(s => seriesMap[s].length));
      const pearsonFn = (x, y) => {
        const n = x.length, mx = x.reduce((a,b)=>a+b)/n, my = y.reduce((a,b)=>a+b)/n;
        let num=0,dx2=0,dy2=0;
        for(let i=0;i<n;i++){num+=(x[i]-mx)*(y[i]-my);dx2+=(x[i]-mx)**2;dy2+=(y[i]-my)**2;}
        return dx2&&dy2?num/Math.sqrt(dx2*dy2):0;
      };
      const lines = [`[상관계수 행렬] ${period}`, `      ${valid.map(s => s.padEnd(6)).join(' ')}`];
      for (const a of valid) {
        const row = valid.map(b => pearsonFn(seriesMap[a].slice(-minLen), seriesMap[b].slice(-minLen)).toFixed(2).padStart(6));
        lines.push(`${a.padEnd(6)} ${row.join(' ')}`);
      }
      return lines.join('\n');
    },
  },
  {
    name: 'stock_index_snapshot',
    description: 'ETF 바스켓(SPY/QQQ/VT/BND/GLD/^VIX) 현재가 스냅샷. 랜덤워크 포트폴리오 모니터링용.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    handler: async () => {
      const basket = ['SPY', 'QQQ', 'VT', 'BND', 'TLT', 'GLD', '^VIX'];
      const results = await Promise.allSettled(basket.map(async sym => {
        const d = await fetchJson(`${YAHOO_BASE}/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=1d`);
        const meta = d.chart?.result?.[0]?.meta;
        if (!meta) return null;
        const prev = meta.previousClose || meta.chartPreviousClose || meta.regularMarketPrice;
        const price = meta.regularMarketPrice;
        const chg = prev ? ((price - prev) / prev * 100) : 0;
        return `${sym.padEnd(6)} $${price?.toFixed(2)?.padStart(8)} ${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`;
      }));
      const lines = results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
      return `[ETF 스냅샷]\n${lines.join('\n')}`;
    },
  },
  {
    name: 'stock_watchlist_get',
    description: '관심종목 목록 조회.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    handler: async () => {
      const fs = require('fs'), path = require('path');
      const wlPath = path.join(__dirname, '../../data/watchlist.json');
      try {
        const wl = JSON.parse(fs.readFileSync(wlPath, 'utf8'));
        if (!wl.items?.length) return '관심종목 없음';
        return `[관심종목]\n${wl.items.map(i => `${i.symbol} (${i.market}): ${i.name}`).join('\n')}`;
      } catch { return '관심종목 없음'; }
    },
  },
  {
    name: 'stock_watchlist_add',
    description: '관심종목 추가.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: '종목 코드' },
        name: { type: 'string', description: '종목명 (선택)' },
        market: { type: 'string', enum: ['KR', 'US'], description: '시장' },
      },
      required: ['symbol', 'market'],
    },
    handler: async ({ symbol, name, market }) => {
      const fs = require('fs'), path = require('path');
      const wlPath = path.join(__dirname, '../../data/watchlist.json');
      let wl = { items: [] };
      try { wl = JSON.parse(fs.readFileSync(wlPath, 'utf8')); } catch {}
      if (!wl.items.find(i => i.symbol === symbol)) {
        wl.items.push({ symbol, name: name || symbol, market });
        fs.writeFileSync(wlPath, JSON.stringify(wl, null, 2), 'utf8');
        return `${symbol} 관심종목 추가됨`;
      }
      return `${symbol} 이미 관심종목에 있음`;
    },
  },
  {
    name: 'stock_watchlist_remove',
    description: '관심종목 제거.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: '종목 코드' },
      },
      required: ['symbol'],
    },
    handler: async ({ symbol }) => {
      const fs = require('fs'), path = require('path');
      const wlPath = path.join(__dirname, '../../data/watchlist.json');
      let wl = { items: [] };
      try { wl = JSON.parse(fs.readFileSync(wlPath, 'utf8')); } catch {}
      const before = wl.items.length;
      wl.items = wl.items.filter(i => i.symbol !== symbol);
      if (wl.items.length < before) {
        fs.writeFileSync(wlPath, JSON.stringify(wl, null, 2), 'utf8');
        return `${symbol} 관심종목에서 제거됨`;
      }
      return `${symbol} 관심종목에 없음`;
    },
  },
];

module.exports = { tools };
