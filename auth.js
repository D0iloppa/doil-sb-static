// 공유 인증 — 관리자 자격은 DB(admin_users)에서 확인 → in-memory 만료 토큰.
// 자격(아이디/비번)은 DB 라 변경 즉시 반영(무재기동). geo 챗봇·관리자 콘솔이 함께 쓴다.
const crypto = require('crypto');
const express = require('express');
const adminUsers = require('./db/adminUsers');

const TOKEN_TTL_MS = 10 * 60 * 1000; // 10분 — 짧은 인증용

// ---- 비밀번호 해시(scrypt, 내장 crypto) ----
function hashPw(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(pw), salt, 64);
  return `scrypt$${salt.toString('hex')}$${h.toString('hex')}`;
}
function verifyPw(pw, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  const h = crypto.scryptSync(String(pw), salt, expected.length);
  return h.length === expected.length && crypto.timingSafeEqual(h, expected);
}

// 부팅 시 1회: admin_users 가 비어있고 CHATBOT_ID/PW 가 있으면 초기 관리자 시드(마이그레이션).
async function seedFromEnv() {
  const id = process.env.CHATBOT_ID || '';
  const pw = process.env.CHATBOT_PW || '';
  if (!id || !pw) return;
  if ((await adminUsers.count()) > 0) return;
  await adminUsers.createUser(id, hashPw(pw), 'root');
  console.log(`👤 root admin '${id}' seeded from env (이후 자격은 DB에서 관리)`);
}
const tokens = new Map(); // token → { exp, username, role }

function issueToken(identity) {
  const token = crypto.randomBytes(24).toString('hex');
  tokens.set(token, { exp: Date.now() + TOKEN_TTL_MS, username: identity.username, role: identity.role });
  return token;
}

// 유효성 검사. slide=true 일 때만 만료를 "지금+TTL"로 갱신(활동 기반). 유효하면 신원 반환.
function tokenInfo(token, slide) {
  const t = tokens.get(token);
  if (!t) return null;
  if (Date.now() > t.exp) { tokens.delete(token); return null; }
  if (slide) t.exp = Date.now() + TOKEN_TTL_MS;
  return t;
}
function validToken(token) { return !!tokenInfo(token, false); }  // 검증만(갱신 안 함)

// 로그인 시도 레이트리밋: IP 당 10분 윈도, 5회 실패 시 잠금
const RL_WINDOW_MS = 10 * 60 * 1000;
const RL_MAX_FAILS = 5;
const fails = new Map();

function rateLimited(ip) {
  const e = fails.get(ip);
  if (!e) return false;
  if (Date.now() - e.firstAt > RL_WINDOW_MS) { fails.delete(ip); return false; }
  return e.count >= RL_MAX_FAILS;
}

function recordFail(ip) {
  const e = fails.get(ip);
  if (!e || Date.now() - e.firstAt > RL_WINDOW_MS) {
    fails.set(ip, { count: 1, firstAt: Date.now() });
  } else {
    e.count += 1;
  }
}

// nginx 프록시 뒤 — 전역 trust proxy 를 건드리지 않고 여기서만 클라이언트 IP 추출
function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.ip || 'unknown';
}

// Bearer 토큰 검증 미들웨어
function requireToken(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const info = tokenInfo(token, false);  // 검증만 — 백그라운드 요청이 세션을 연장하지 않도록
  if (!info) {
    return res.status(401).json({ error: 'Unauthorized', message: '로그인이 필요하거나 토큰이 만료되었습니다.' });
  }
  req.admin = { username: info.username, role: info.role };
  next();
}

// 활동 기반 세션 갱신 — 클라이언트가 페이지 이동/DOBIS·SSH 사용 시 호출
function touchSession(token) { tokenInfo(token, true); }

// 루트 관리자 전용
function requireRoot(req, res, next) {
  requireToken(req, res, () => {
    if (req.admin.role !== 'root') return res.status(403).json({ error: 'root only', message: '루트 관리자만 가능합니다.' });
    next();
  });
}

// POST /login (마운트: /api/auth) — DB 자격 확인 → 토큰 발급
const router = express.Router();
router.post('/login', async (req, res) => {
  const ip = clientIp(req);
  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'Too many attempts', message: '로그인 시도가 많습니다. 잠시 후 다시 시도하세요.' });
  }
  const { id, pw } = req.body || {};
  try {
    if ((await adminUsers.count()) === 0) {
      return res.status(503).json({ error: 'Not configured', message: '관리자 계정 미설정' });
    }
    const u = id ? await adminUsers.getByUsername(String(id)) : null;
    if (!u || !verifyPw(pw, u.pw_hash)) {
      recordFail(ip);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    fails.delete(ip);
    res.json({ token: issueToken({ username: u.username, role: u.role }), role: u.role, username: u.username, expiresInSec: TOKEN_TTL_MS / 1000, wsshSecret: process.env.WEBSSH_SECRET || '' });
  } catch (e) {
    console.error('[auth] login error:', e.message);
    res.status(502).json({ error: 'auth backend error' });
  }
});

// POST /touch — 활동 기반 세션 갱신(페이지 이동/DOBIS·SSH 사용). 남은 시간 반환.
router.post('/touch', requireToken, (req, res) => {
  const token = (req.headers.authorization || '').slice(7);
  touchSession(token);
  res.json({ expiresInSec: TOKEN_TTL_MS / 1000 });
});

// POST /credentials (토큰 필요) — 현재 비번 확인 후 아이디/비번 변경(무재기동 반영)
router.post('/credentials', requireToken, async (req, res) => {
  const { currentUsername, currentPassword, newUsername, newPassword } = req.body || {};
  if (!currentUsername || !currentPassword) return res.status(400).json({ error: 'current credentials required' });
  if (!newUsername && !newPassword) return res.status(400).json({ error: 'nothing to change' });
  if (newPassword && String(newPassword).length < 6) return res.status(400).json({ error: 'password too short (min 6)' });
  try {
    const u = await adminUsers.getByUsername(String(currentUsername));
    if (!u || !verifyPw(currentPassword, u.pw_hash)) return res.status(401).json({ error: 'current credentials invalid' });
    const ok = await adminUsers.updateCredential(
      String(currentUsername),
      newUsername ? String(newUsername) : null,
      newPassword ? hashPw(newPassword) : null
    );
    if (!ok) return res.status(404).json({ error: 'admin not found' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[auth] credentials error:', e.message);
    res.status(502).json({ error: 'auth backend error' });
  }
});

// ===== 서브관리자 관리 (루트 전용) =====
router.get('/admins', requireRoot, async (req, res) => {
  try { res.json({ admins: await adminUsers.listAll(), me: req.admin }); }
  catch (e) { console.error('[auth] list admins:', e.message); res.status(502).json({ error: 'auth backend error' }); }
});

router.post('/admins', requireRoot, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !/^[\w.-]{2,32}$/.test(String(username))) return res.status(400).json({ error: 'invalid username (2-32, 영숫자._-)' });
  if (!password || String(password).length < 6) return res.status(400).json({ error: 'password too short (min 6)' });
  try {
    if (await adminUsers.getByUsername(String(username))) return res.status(409).json({ error: 'username exists' });
    await adminUsers.createUser(String(username), hashPw(password), 'sub');
    res.status(201).json({ ok: true, username, role: 'sub' });
  } catch (e) { console.error('[auth] create admin:', e.message); res.status(502).json({ error: 'auth backend error' }); }
});

router.delete('/admins/:username', requireRoot, async (req, res) => {
  const username = String(req.params.username || '');
  if (username === req.admin.username) return res.status(400).json({ error: 'cannot delete self' });
  try {
    const ok = await adminUsers.deleteSub(username);  // 루트는 삭제 불가(쿼리에서 차단)
    if (!ok) return res.status(404).json({ error: 'not found or is root' });
    res.json({ ok: true, deleted: username });
  } catch (e) { console.error('[auth] delete admin:', e.message); res.status(502).json({ error: 'auth backend error' }); }
});

module.exports = { router, requireToken, requireRoot, validToken, seedFromEnv };
