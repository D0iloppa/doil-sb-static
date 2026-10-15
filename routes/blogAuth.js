// 블로그 소셜 로그인 — GitHub / Google OAuth2. passport 없이 경량 구현(global fetch).
// 콜백에서 blog_users upsert → 서명 세션 쿠키. 운영자(=사이트 주인)는 BLOG_OWNER_* env 매칭으로 is_op.
const express = require('express');
const crypto = require('crypto');
const blog = require('../db/blog');
const session = require('../blogSession');

const router = express.Router();

// ── provider 설정 ────────────────────────────────────────────
const PROVIDERS = {
  github: {
    clientId: () => process.env.BLOG_GITHUB_CLIENT_ID || '',
    clientSecret: () => process.env.BLOG_GITHUB_CLIENT_SECRET || '',
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scope: 'read:user user:email',
  },
  google: {
    clientId: () => process.env.BLOG_GOOGLE_CLIENT_ID || '',
    clientSecret: () => process.env.BLOG_GOOGLE_CLIENT_SECRET || '',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile',
  },
};

// 운영자(=나) 판정: BLOG_OWNER_GITHUB(=github login), BLOG_OWNER_GOOGLE(=google 이메일). 콤마 다중 허용.
function isOwner(provider, { login, email }) {
  const key = provider === 'github' ? process.env.BLOG_OWNER_GITHUB : process.env.BLOG_OWNER_GOOGLE;
  if (!key) return false;
  const allow = String(key).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const candidates = [login, email].filter(Boolean).map((s) => String(s).toLowerCase());
  return candidates.some((c) => allow.includes(c));
}

function originBase(req) {
  if (process.env.BLOG_OAUTH_BASE) return process.env.BLOG_OAUTH_BASE.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['host'];
  return `${proto}://${host}`;
}
function redirectUri(req, provider) {
  return `${originBase(req)}/blog/auth/${provider}/callback`;
}
// 로그인 후 돌아갈 안전한 경로(오픈리다이렉트 방지: 사이트 내부 경로만)
function safeNext(next) {
  if (typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')) return next;
  return '/blog';
}

// ── 로그인 시작 ──────────────────────────────────────────────
router.get('/auth/:provider', (req, res) => {
  const provider = req.params.provider;
  const cfg = PROVIDERS[provider];
  if (!cfg) return res.status(404).send('unknown provider');
  if (!cfg.clientId()) return res.status(503).send(`${provider} 로그인이 아직 설정되지 않았습니다(.env 미입력).`);

  const state = crypto.randomBytes(16).toString('hex');
  session.setState(res, provider, state, safeNext(req.query.next));
  const params = new URLSearchParams({
    client_id: cfg.clientId(),
    redirect_uri: redirectUri(req, provider),
    scope: cfg.scope,
    state,
    response_type: 'code',
  });
  if (provider === 'google') { params.set('access_type', 'online'); params.set('prompt', 'select_account'); }
  res.redirect(`${cfg.authorizeUrl}?${params.toString()}`);
});

// ── 콜백 ─────────────────────────────────────────────────────
router.get('/auth/:provider/callback', async (req, res) => {
  const provider = req.params.provider;
  const cfg = PROVIDERS[provider];
  if (!cfg) return res.status(404).send('unknown provider');

  const saved = session.readState(req, provider);
  session.clearState(res, provider);
  if (!saved || !req.query.state || req.query.state !== saved.state) {
    return res.status(400).send('state mismatch (다시 시도해 주세요)');
  }
  const code = req.query.code;
  if (!code) return res.status(400).send('missing code');

  try {
    // 1) code → access_token
    const tokenRes = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        client_id: cfg.clientId(),
        client_secret: cfg.clientSecret(),
        code: String(code),
        redirect_uri: redirectUri(req, provider),
        grant_type: 'authorization_code',
      }),
    });
    const tokenJson = await tokenRes.json();
    const accessToken = tokenJson.access_token;
    if (!accessToken) { console.error('[blog-auth] no access_token:', tokenJson); return res.status(502).send('토큰 발급 실패'); }

    // 2) 프로필 조회
    let profile;
    if (provider === 'github') {
      const uRes = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'doil-blog', Accept: 'application/vnd.github+json' },
      });
      const u = await uRes.json();
      let email = u.email;
      if (!email) {
        const eRes = await fetch('https://api.github.com/user/emails', {
          headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'doil-blog', Accept: 'application/vnd.github+json' },
        });
        const emails = await eRes.json();
        if (Array.isArray(emails)) email = (emails.find((e) => e.primary) || emails[0] || {}).email;
      }
      profile = { uid: String(u.id), name: u.name || u.login, avatar: u.avatar_url, login: u.login, email };
    } else {
      const uRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const u = await uRes.json();
      profile = { uid: String(u.id), name: u.name || u.email, avatar: u.picture, login: u.email, email: u.email };
    }
    if (!profile.uid) return res.status(502).send('프로필 조회 실패');

    // 3) upsert + 운영자 판정
    const op = isOwner(provider, { login: profile.login, email: profile.email });
    const user = await blog.upsertOAuthUser({
      provider, provider_uid: profile.uid, display_name: profile.name,
      avatar_url: profile.avatar, is_op: op,
    });

    // 4) 세션 + 리다이렉트
    session.setSession(res, user.id);
    res.redirect(saved.next || '/blog');
  } catch (e) {
    console.error('[blog-auth] callback error:', e.message);
    res.status(502).send('로그인 처리 중 오류가 발생했습니다.');
  }
});

// ── 로그아웃 ─────────────────────────────────────────────────
router.post('/auth/logout', (req, res) => {
  session.clearSession(res);
  res.json({ ok: true });
});

module.exports = router;
