// DOBIS 챗봇 소켓 중계 — 저장 없음(휘발성). 브라우저 ↔ /dobis ↔ 호스트 워커(/dobis-worker).
// doil-sb 는 무상태 relay. 세션 기록은 워커 메모리에만. 워커 라이프사이클은 host waker 가 관리.
const crypto = require('crypto');
const express = require('express');
const { validToken, requireToken, tokenInfo } = require('./auth');

const WORKER_SECRET = process.env.DOBIS_WORKER_SECRET || '';
const QUICK_ACTION_SECRET = process.env.DOBIS_QUICK_ACTION_SECRET || '';
const QUICK_ACTION_USER = process.env.DOBIS_QUICK_ACTION_USER || process.env.CHATBOT_ID || 'default';

let activeBrowsers = 0;     // 연결된 브라우저 /dobis 소켓 수(세션 활성 지표)
let pendingQuickActions = 0; // 처리 중인 quick-action 요청 수 — waker 가 /status 로 보고 워커를 깨우게 함
let workerSocket = null;    // 단일 워커 소켓
let lastUsage = null;       // 워커가 보고한 최신 사용량 {activeAlias,fiveHour,session,weekly}
let lastStats = null;       // 워커가 보고한 최신 다마고치 상태 {lv,exp,expNeed,hp,mood}
let lastShared = null;      // 워커가 보고한 최신 shared 사용량 {usedBytes,limitGB,files}
let lastProfiles = null;    // 워커가 보고한 최신 프로파일 목록 {profiles:[{alias,config_dir}],active}
const jobs = new Map();     // jid -> 브라우저 소켓
const connectedSockets = new Map();  // socketId -> socket (chat 이벤트 응답 라우팅용)
const queryPending = new Map();      // qid -> { resolve, reject } (서버 내부 one-shot 쿼리)
const profileOpPending = new Map();  // opId -> { resolve, reject } (프로파일 CRUD 요청/응답)
const quickJobs = new Map();         // jid -> { resolve, reject } (quick-action one-shot job 응답 대기)

// restore_md 절단 — 20000자(=워커 HISTORY_TAIL 여유를 두고 잡은 브리지 측 상한)를 넘으면
// 글자 단위로 자르지 않고 메시지 경계('**YOU:**'/'**DOBIS:**' 줄 시작)까지 더 버려서
// 항상 완전한 메시지부터 시작하게 한다(반토막 메시지가 워커로 넘어가는 것 방지).
function _truncateMdAtBoundary(md, maxLen) {
  if (md.length <= maxLen) return md;
  const tail = md.slice(-maxLen);
  const m = tail.search(/\n\*\*(YOU|DOBIS):\*\* /);
  if (m === -1) return tail;   // 경계를 못 찾으면 기존처럼 자름(fail-open)
  return tail.slice(m + 1);    // 앞의 '\n' 은 버리고 '**YOU:**...'/'**DOBIS:**...' 부터 시작
}

function registerDobis(io) {
  const nsp = io.of('/dobis');
  const wnsp = io.of('/dobis-worker');

  nsp.use((s, next) => {
    const t = s.handshake.auth && s.handshake.auth.token;
    if (t && validToken(t)) return next();
    next(new Error('unauthorized'));
  });
  wnsp.use((s, next) => {
    const sec = s.handshake.auth && s.handshake.auth.secret;
    if (WORKER_SECRET && sec === WORKER_SECRET) return next();
    next(new Error('unauthorized'));
  });

  nsp.on('connection', (socket) => {
    activeBrowsers++;
    // 인증 토큰에서 username 추출 — 워커에 전달해 per-user 세션 키잉에 사용
    const _tok = socket.handshake.auth && socket.handshake.auth.token;
    socket._username = (tokenInfo(_tok, false) || {}).username || 'default';
    connectedSockets.set(socket.id, socket);

    socket.emit('dobis:ready', { worker: !!workerSocket });
    if (lastStats) socket.emit('dobis:stats', lastStats);
    if (lastShared) socket.emit('dobis:shared', lastShared);
    if (lastProfiles) socket.emit('dobis:profiles', lastProfiles);
    socket.on('dobis:msg', (m = {}) => {
      const message = String((m && m.message) || '').trim();
      const hasFiles = Array.isArray(m.files) && m.files.length > 0;
      if (!message && !m.image_b64 && !hasFiles) return;
      if (!workerSocket) { socket.emit('dobis:status', 'offline'); return; }
      const jid = crypto.randomBytes(8).toString('hex');
      jobs.set(jid, socket);
      const payload = { jid, sessionId: socket.id, username: socket._username, model: m.model, message, hud: m.hud };
      if (hasFiles) payload.files = m.files;
      if (m.image_b64) { payload.image_b64 = m.image_b64; payload.image_type = m.image_type || 'image/jpeg'; }  // 하위호환
      if (m.restore_md) payload.restore_md = _truncateMdAtBoundary(String(m.restore_md), 20000);   // 현재 대화 맥락(워커가 세션 유실 시만 사용) — 최근(tail) 우선: 긴 대화는 끝부분이 중요
      workerSocket.emit('job', payload);
    });
    // 진행 중 응답 중단 → 워커로 전달
    socket.on('dobis:cancel', () => { if (workerSocket) workerSocket.emit('cancel', { sessionId: socket.id, username: socket._username }); });
    // 채팅 저장/목록/불러오기 → 워커로 전달. _sid + username 을 포함해 응답이 요청 소켓으로만 돌아오게 함.
    ['chat:save', 'chat:append', 'chat:list', 'chat:load', 'chat:rename', 'chat:delete', 'newchat',
     'music:rename', 'music:reorder', 'fs:list', 'fs:read', 'fs:write', 'fs:upload'].forEach((ev) => {
      socket.on(ev, (p) => {
        if (workerSocket) workerSocket.emit(ev, { ...(p || {}), _sid: socket.id, username: socket._username });
      });
    });
    socket.on('disconnect', () => {
      activeBrowsers = Math.max(0, activeBrowsers - 1);
      connectedSockets.delete(socket.id);
      for (const [j, b] of jobs) if (b === socket) jobs.delete(j);
    });
  });

  wnsp.on('connection', (socket) => {
    workerSocket = socket;
    nsp.emit('dobis:status', 'online');
    socket.on('usage', (u) => { lastUsage = u || null; nsp.emit('dobis:usage', lastUsage); });
    socket.on('stats', (s) => { lastStats = s || null; nsp.emit('dobis:stats', lastStats); });
    socket.on('shared', (s) => { lastShared = s || null; nsp.emit('dobis:shared', lastShared); });
    socket.on('profiles', (p) => { lastProfiles = p || null; nsp.emit('dobis:profiles', lastProfiles); });
    socket.on('profile_result', ({ opId, ...rest }) => { const p = profileOpPending.get(opId); if (p) { profileOpPending.delete(opId); p.resolve(rest); } });
    socket.on('allowed_models_result', ({ opId, ...rest }) => { const p = profileOpPending.get(opId); if (p) { profileOpPending.delete(opId); p.resolve(rest); } });
    socket.on('set_model_result', ({ opId, ...rest }) => { const p = profileOpPending.get(opId); if (p) { profileOpPending.delete(opId); p.resolve(rest); } });
    socket.on('imggen-usage', (d) => { nsp.emit('dobis:imggen-usage', d); });
    socket.on('delta', ({ jid, text }) => { const b = jobs.get(jid); if (b) b.emit('dobis:delta', { text }); });
    socket.on('think-ping', ({ jid }) => { const b = jobs.get(jid); if (b) b.emit('dobis:think-ping', {}); });
    socket.on('query-done', ({ qid, text }) => { const p = queryPending.get(qid); if (p) { queryPending.delete(qid); p.resolve(text); } });
    socket.on('query-err', ({ qid, error }) => { const p = queryPending.get(qid); if (p) { queryPending.delete(qid); p.reject(new Error(error)); } });
    socket.on('music-update', () => { nsp.emit('dobis:music-update', {}); });
    socket.on('done', (p) => {
      const jid = p && p.jid;
      const b = jid && jobs.get(jid);
      if (b) { const { jid: _j, ...rest } = p; b.emit('dobis:done', rest); jobs.delete(jid); return; }
      const qp = jid && quickJobs.get(jid);
      if (qp) { quickJobs.delete(jid); qp.resolve(p || {}); }
    });
    socket.on('err', ({ jid, message }) => {
      const b = jobs.get(jid);
      if (b) { b.emit('dobis:error', message); jobs.delete(jid); return; }
      const qp = quickJobs.get(jid);
      if (qp) { quickJobs.delete(jid); qp.reject(new Error(message || 'DOBIS error')); }
    });
    socket.on('yt-prog', (p) => { const b = jobs.get(p && p.jid); if (b) b.emit('dobis:yt-prog', p); });
    socket.on('queue', (p) => { nsp.emit('dobis:queue', p); });
    // 채팅/FS 응답 → _sid 가 있으면 요청한 소켓에만, 없으면 브로드캐스트(이전 버전 하위호환)
    ['chat:saved', 'chat:appended', 'chat:listed', 'chat:loaded', 'chat:renamed', 'chat:deleted',
     'fs:listed', 'fs:read-done', 'fs:write-done', 'fs:upload-done'].forEach((ev) => {
      socket.on(ev, (p) => {
        const target = p && p._sid && connectedSockets.get(p._sid);
        if (target) target.emit(ev, p);
        else nsp.emit(ev, p);
      });
    });
    socket.on('disconnect', () => {
      if (workerSocket === socket) workerSocket = null;
      lastUsage = null;
      for (const [, b] of jobs) b.emit('dobis:error', 'DOBIS 워커 연결이 끊겼어요.');
      jobs.clear();
      nsp.emit('dobis:status', 'offline');
    });
  });
}

const statusRouter = express.Router();
// host waker 가 폴링(시크릿 헤더). { active, worker }
statusRouter.get('/status', (req, res) => {
  if (!WORKER_SECRET || req.headers['x-dobis-secret'] !== WORKER_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  // pendingQuickActions 도 합산 — 브라우저 없이 quick-action 만 와도 waker 가 워커를 깨우게 함
  res.json({ active: activeBrowsers + pendingQuickActions, worker: !!workerSocket });
});
// 콘솔이 폴링(관리자 토큰) — 워커 기동 없이 헬스+사용량+프로파일 조회.
statusRouter.get('/health', requireToken, (req, res) => {
  res.json({ worker: !!workerSocket, usage: lastUsage, profiles: lastProfiles });
});
// 수동 프로파일 전환(관리자 토큰) — 워커에 switch 전달(alias). 워커가 클린 재시작하므로 응답은 낙관적.
statusRouter.post('/account', requireToken, express.json(), (req, res) => {
  const alias = String((req.body || {}).alias || '').trim();
  if (!alias) return res.status(400).json({ error: 'invalid alias' });
  if (!workerSocket) return res.status(503).json({ error: 'worker offline' });
  workerSocket.emit('switch', { alias });
  res.json({ ok: true, alias });
});

// 프로파일 CRUD(관리자 토큰) — 워커에 위임하고 profile_result(opId) 로 응답을 기다린다.
function dobisProfileOp(event, payload, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    if (!workerSocket) return reject(new Error('DOBIS 워커 오프라인'));
    const opId = crypto.randomBytes(8).toString('hex');
    const timer = setTimeout(() => {
      profileOpPending.delete(opId);
      reject(new Error('DOBIS profile op timeout'));
    }, timeoutMs);
    profileOpPending.set(opId, {
      resolve: (r) => { clearTimeout(timer); resolve(r); },
      reject: (err) => { clearTimeout(timer); reject(err); },
    });
    workerSocket.emit(event, { opId, ...payload });
  });
}
statusRouter.post('/profiles', requireToken, express.json(), async (req, res) => {
  const alias = String((req.body || {}).alias || '').trim();
  const config_dir = String((req.body || {}).config_dir || '').trim();
  const provider = (req.body || {}).provider;   // 선택값 — 미전달 시 워커가 'anthropic' 으로 기본 처리
  if (!alias || !config_dir) return res.status(400).json({ error: 'alias·config_dir 필수' });
  try {
    const r = await dobisProfileOp('profile_add', { alias, config_dir, provider });
    if (!r.ok) return res.status(400).json({ error: r.error || '추가 실패' });
    res.json(r);
  } catch (e) { res.status(503).json({ error: e.message }); }
});
statusRouter.put('/profiles/:alias', requireToken, express.json(), async (req, res) => {
  const alias = req.params.alias;
  const new_alias = (req.body || {}).new_alias;
  const config_dir = (req.body || {}).config_dir;
  const provider = (req.body || {}).provider;
  try {
    const r = await dobisProfileOp('profile_edit', { alias, new_alias, config_dir, provider });
    if (!r.ok) return res.status(400).json({ error: r.error || '수정 실패' });
    res.json(r);
  } catch (e) { res.status(503).json({ error: e.message }); }
});
statusRouter.delete('/profiles/:alias', requireToken, async (req, res) => {
  try {
    const r = await dobisProfileOp('profile_delete', { alias: req.params.alias });
    if (!r.ok) return res.status(400).json({ error: r.error || '삭제 실패' });
    res.json(r);
  } catch (e) { res.status(503).json({ error: e.message }); }
});

// 현재 활성 provider(anthropic/omniroute)의 허용 모델 목록 + 마지막 선택값(관리자 토큰).
statusRouter.get('/models', requireToken, async (req, res) => {
  try {
    const r = await dobisProfileOp('get_allowed_models', {});
    if (!r.ok) return res.status(400).json({ error: r.error || '모델 목록 조회 실패' });
    res.json(r);
  } catch (e) { res.status(503).json({ error: e.message }); }
});
// 현재 활성 provider 기준으로 사용할 모델을 지정(관리자 토큰) — provider 별로 서버가 기억.
statusRouter.post('/model', requireToken, express.json(), async (req, res) => {
  const model = String((req.body || {}).model || '').trim();
  if (!model) return res.status(400).json({ error: 'model 필수' });
  try {
    const r = await dobisProfileOp('set_active_model', { model });
    if (!r.ok) return res.status(400).json({ error: r.error || '모델 설정 실패' });
    res.json(r);
  } catch (e) { res.status(503).json({ error: e.message }); }
});

// 서버 내부에서 DOBIS worker에 one-shot 프롬프트를 보내고 텍스트 응답을 받는다.
// worker.py의 @sio.on("query") 핸들러와 쌍을 이룬다.
function dobisQuery(prompt, model = 'haiku', timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    if (!workerSocket) return reject(new Error('DOBIS 워커 오프라인'));
    const qid = crypto.randomBytes(8).toString('hex');
    const timer = setTimeout(() => {
      queryPending.delete(qid);
      reject(new Error('DOBIS query timeout'));
    }, timeoutMs);
    queryPending.set(qid, {
      resolve: (text) => { clearTimeout(timer); resolve(text); },
      reject: (err)  => { clearTimeout(timer); reject(err); },
    });
    workerSocket.emit('query', { qid, prompt, model });
  });
}

// 워커가 잠들어있으면(idle 세션 종료 후) pendingQuickActions 로 waker 를 깨우고 기동을 기다린다.
function _waitForWorker(timeoutMs) {
  if (workerSocket) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const iv = setInterval(() => {
      if (workerSocket) { clearInterval(iv); resolve(); return; }
      if (Date.now() - start > timeoutMs) { clearInterval(iv); reject(new Error('DOBIS 워커 기동 대기 시간 초과')); }
    }, 500);
  });
}

// quick-action — 로그인 세션 없이 DOBIS 상주 세션(job/done 파이프라인)에 one-shot 메시지를 보내고
// 최종 응답을 받는다. 일반 채팅과 동일한 job 이벤트를 타므로 persona·memory·MCP 스킬(doil-secretary 등)
// 접근이 채팅과 동일하다. sessionId 를 고정값으로 둬 quick-action 끼리만 큐를 공유(브라우저 탭과 분리).
function runQuickAction(message, opts = {}) {
  const timeoutMs = opts.timeoutMs || 90000;
  pendingQuickActions++;
  return _waitForWorker(30000)
    .then(() => new Promise((resolve, reject) => {
      const jid = crypto.randomBytes(8).toString('hex');
      const timer = setTimeout(() => {
        quickJobs.delete(jid);
        reject(new Error('DOBIS quick-action timeout'));
      }, timeoutMs);
      quickJobs.set(jid, {
        resolve: (r) => { clearTimeout(timer); resolve(r); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      const payload = { jid, sessionId: 'quickaction', username: opts.username || QUICK_ACTION_USER, message };
      if (opts.image_b64) { payload.image_b64 = opts.image_b64; payload.image_type = opts.image_type || 'image/jpeg'; }
      workerSocket.emit('job', payload);
    }))
    .finally(() => { pendingQuickActions = Math.max(0, pendingQuickActions - 1); });
}

// POST /quick-action — 로그인 세션 없이(고정 시크릿) DOBIS 에게 명령 실행. 애플 단축어 등
// 외부 트리거로 퀵메모·일정등록 같은 doil-secretary 스킬을 여는 엔트리포인트로 쓴다.
// image_b64(순수 base64, 옵션) 첨부 시 job payload 로 그대로 전달 — worker.py 는 브라우저 업로드와
// 동일 경로(_files_raw)로 처리하므로 이 쪽은 수정 불필요.
statusRouter.post('/quick-action', express.json({ limit: '15mb' }), async (req, res) => {
  if (!QUICK_ACTION_SECRET || req.headers['x-quick-secret'] !== QUICK_ACTION_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const message = String((req.body || {}).message || '').trim();
  if (!message) return res.status(400).json({ error: 'message 필수' });
  // username 을 주면 그 이름의 대화공간(chats/<user>/)·세션으로 분리된다.
  // 워커 세션 키가 (username, model, ...) 이므로 서로 맥락이 섞이지 않는다.
  // 안 주면 기존대로 QUICK_ACTION_USER(애플 단축어 등 기존 호출 호환).
  const rawUser = String((req.body || {}).username || '').trim();
  const username = /^[A-Za-z0-9_-]{1,32}$/.test(rawUser) ? rawUser : undefined;
  const rawImage = (req.body || {}).image_b64 ? String(req.body.image_b64) : '';
  const image_b64 = rawImage.replace(/^data:[^;]+;base64,/, '');   // 단축어가 Data URL 형태로 보내도 방어
  const image_type = (req.body || {}).image_type ? String(req.body.image_type) : undefined;
  try {
    const opts = image_b64 ? { image_b64, image_type } : {};
    if (username) opts.username = username;
    const result = await runQuickAction(message, opts);
    res.json({ text: (result && result.text) || '' });
  } catch (e) {
    res.status(503).json({ error: e.message });
  }
});

module.exports = { registerDobis, statusRouter, dobisQuery };
