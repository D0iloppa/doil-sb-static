// 블로그 사용자 세션 — 서명 쿠키(HMAC). 자체 PW 저장 없이 OAuth 신원만 담는다.
// 쿠키값 형식: <userId>.<expMs>.<sig>   (sig = HMAC-SHA256("<userId>.<expMs>", secret))
const crypto = require('crypto');
const blog = require('./db/blog');

const COOKIE = 'blog_sess';
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30일
const SECRET = process.env.BLOG_SESSION_SECRET || process.env.DOBIS_WORKER_SECRET || 'blog-dev-secret';

function sign(payload) {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
}
function makeToken(userId) {
  const exp = Date.now() + TTL_MS;
  const payload = `${userId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}
function verifyToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const [userId, exp, sig] = parts;
  const payload = `${userId}.${exp}`;
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  if (Date.now() > Number(exp)) return null;
  const id = Number(userId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Cookie 헤더 파싱(express 5 기본 미포함) — 필요한 키만.
function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

function setSession(res, userId) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.append('Set-Cookie',
    `${COOKIE}=${encodeURIComponent(makeToken(userId))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TTL_MS / 1000}${secure}`);
}
function clearSession(res) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.append('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

// req.blogUser 를 채우는 미들웨어(비로그인이면 null). DB 오류 시에도 페이지는 뜬다.
async function attachBlogUser(req, res, next) {
  req.blogUser = null;
  try {
    const id = verifyToken(readCookie(req, COOKIE));
    if (id) req.blogUser = await blog.getUser(id);
  } catch (e) {
    console.error('[blog-session] attach error:', e.message);
  }
  next();
}

// API 보호: 로그인 필수
function requireBlogUser(req, res, next) {
  if (!req.blogUser) return res.status(401).json({ error: 'login required', message: '로그인이 필요합니다.' });
  next();
}

// 짧은 수명 state 쿠키(OAuth CSRF) — 서명 없이 랜덤 대조만.
function setState(res, provider, state, next) {
  const val = encodeURIComponent(JSON.stringify({ state, next: next || '' }));
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.append('Set-Cookie', `blog_oauth_${provider}=${val}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${secure}`);
}
function readState(req, provider) {
  const raw = readCookie(req, `blog_oauth_${provider}`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
function clearState(res, provider) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.append('Set-Cookie', `blog_oauth_${provider}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

module.exports = {
  attachBlogUser, requireBlogUser, setSession, clearSession,
  setState, readState, clearState,
};
