// DOBIS 챗봇 소켓 중계 — 저장 없음(휘발성). 브라우저 ↔ /dobis ↔ 호스트 워커(/dobis-worker).
// doil-sb 는 무상태 relay. 세션 기록은 워커 메모리에만. 워커 라이프사이클은 host waker 가 관리.
const crypto = require('crypto');
const express = require('express');
const { validToken, requireToken, tokenInfo } = require('./auth');

const WORKER_SECRET = process.env.DOBIS_WORKER_SECRET || '';

let activeBrowsers = 0;     // 연결된 브라우저 /dobis 소켓 수(세션 활성 지표)
let workerSocket = null;    // 단일 워커 소켓
let lastUsage = null;       // 워커가 보고한 최신 사용량 {account,total,fiveHour}
let lastStats = null;       // 워커가 보고한 최신 다마고치 상태 {lv,exp,expNeed,hp,mood}
let lastShared = null;      // 워커가 보고한 최신 shared 사용량 {usedBytes,limitGB,files}
const jobs = new Map();     // jid -> 브라우저 소켓
const connectedSockets = new Map();  // socketId -> socket (chat 이벤트 응답 라우팅용)
const queryPending = new Map();      // qid -> { resolve, reject } (서버 내부 one-shot 쿼리)

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
      if (m.restore_md) payload.restore_md = String(m.restore_md).slice(-20000);   // 현재 대화 맥락(워커가 세션 유실 시만 사용) — 최근(tail) 우선: 긴 대화는 끝부분이 중요
      workerSocket.emit('job', payload);
    });
    // 진행 중 응답 중단 → 워커로 전달
    socket.on('dobis:cancel', () => { if (workerSocket) workerSocket.emit('cancel', { sessionId: socket.id, username: socket._username }); });
    // 채팅 저장/목록/불러오기 → 워커로 전달. _sid + username 을 포함해 응답이 요청 소켓으로만 돌아오게 함.
    ['chat:save', 'chat:list', 'chat:load', 'chat:rename', 'chat:delete', 'newchat',
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
    socket.on('imggen-usage', (d) => { nsp.emit('dobis:imggen-usage', d); });
    socket.on('delta', ({ jid, text }) => { const b = jobs.get(jid); if (b) b.emit('dobis:delta', { text }); });
    socket.on('think-ping', ({ jid }) => { const b = jobs.get(jid); if (b) b.emit('dobis:think-ping', {}); });
    socket.on('query-done', ({ qid, text }) => { const p = queryPending.get(qid); if (p) { queryPending.delete(qid); p.resolve(text); } });
    socket.on('query-err', ({ qid, error }) => { const p = queryPending.get(qid); if (p) { queryPending.delete(qid); p.reject(new Error(error)); } });
    socket.on('music-update', () => { nsp.emit('dobis:music-update', {}); });
    socket.on('done', (p) => { const b = jobs.get(p && p.jid); if (b) { const { jid, ...rest } = p; b.emit('dobis:done', rest); } if (p && p.jid) jobs.delete(p.jid); });
    socket.on('err', ({ jid, message }) => { const b = jobs.get(jid); if (b) b.emit('dobis:error', message); jobs.delete(jid); });
    socket.on('yt-prog', (p) => { const b = jobs.get(p && p.jid); if (b) b.emit('dobis:yt-prog', p); });
    socket.on('queue', (p) => { nsp.emit('dobis:queue', p); });
    // 채팅/FS 응답 → _sid 가 있으면 요청한 소켓에만, 없으면 브로드캐스트(이전 버전 하위호환)
    ['chat:saved', 'chat:listed', 'chat:loaded', 'chat:renamed', 'chat:deleted',
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
  res.json({ active: activeBrowsers, worker: !!workerSocket });
});
// 콘솔이 폴링(관리자 토큰) — 워커 기동 없이 헬스+사용량 조회.
statusRouter.get('/health', requireToken, (req, res) => {
  res.json({ worker: !!workerSocket, usage: lastUsage });
});
// 수동 계정 전환(관리자 토큰) — 워커에 switch 전달.
statusRouter.post('/account', requireToken, express.json(), (req, res) => {
  const index = Number((req.body || {}).index);
  if (!Number.isInteger(index) || index < 0 || index > 1) return res.status(400).json({ error: 'invalid index' });
  if (!workerSocket) return res.status(503).json({ error: 'worker offline' });
  workerSocket.emit('switch', { index });
  res.json({ ok: true, index });
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

module.exports = { registerDobis, statusRouter, dobisQuery };
