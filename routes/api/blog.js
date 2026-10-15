// 블로그 JSON API — 공개 읽기 + 로그인 사용자 댓글/claps + 관리자(requireToken) CRUD.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { requireToken } = require('../../auth');
const blog = require('../../db/blog');
const session = require('../../blogSession');

const router = express.Router();

// ── 이미지 저장 경로 ──────────────────────────────────────────
// CDN_ROOT 는 nginx/cdn 마운트(컨테이너 /app/cdn). imgproxy 가 같은 dir 을 :ro 로 서빙 → /cdn/... 최적화.
const CDN_ROOT = process.env.CDN_ROOT || '/app/cdn';
const BLOG_IMG_ROOT = path.join(CDN_ROOT, 'blog');
const TRASH_ROOT = path.join(CDN_ROOT, '.trash');
const IMG_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => cb(null, !!IMG_EXT[file.mimetype]),
});

// 블로그 admin 인증 — 사람용 로그인 토큰(requireToken) 또는 무인 MCP 서비스 토큰 허용.
// 서비스 토큰은 이 라우터(블로그 admin)에서만 유효 — 전역 requireToken 은 건드리지 않아 SSH/레지스트리엔 무효.
const SERVICE_TOKEN = process.env.BLOG_SERVICE_TOKEN || '';
function timingEq(a, b) {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}
function requireBlogAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const tok = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (SERVICE_TOKEN && tok && timingEq(tok, SERVICE_TOKEN)) {
    req.admin = { username: 'mcp-service', role: 'service' };
    return next();
  }
  return requireToken(req, res, next);
}

// 모든 응답에서 현재 블로그 로그인 사용자 파악(쿠키). 비로그인이면 req.blogUser=null.
router.use(session.attachBlogUser);

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  return xff ? String(xff).split(',')[0].trim() : (req.ip || 'unknown');
}
function publicUser(u) {
  return u ? { id: u.id, name: u.display_name, avatar: u.avatar_url, is_op: u.is_op } : null;
}

// ── 현재 로그인 사용자 ────────────────────────────────────────
router.get('/me', (req, res) => res.json({ user: publicUser(req.blogUser) }));

// ── 공개: 카테고리 트리 / 태그 ────────────────────────────────
router.get('/categories', async (req, res) => {
  try { res.json({ categories: await blog.categoryTree() }); }
  catch (e) { console.error('[blog] categories:', e.message); res.status(502).json({ error: 'db error' }); }
});
router.get('/tags', async (req, res) => {
  try { res.json({ tags: await blog.listTags() }); }
  catch (e) { console.error('[blog] tags:', e.message); res.status(502).json({ error: 'db error' }); }
});

// ── 공개: 글 목록 ────────────────────────────────────────────
router.get('/posts', async (req, res) => {
  try {
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
    const page = Math.max(1, Number(req.query.page) || 1);
    const offset = (page - 1) * limit;
    let categoryIds = null;
    if (req.query.category) {
      const cat = await blog.resolveCategoryPath(String(req.query.category).split('/').filter(Boolean));
      categoryIds = cat ? await blog.descendantIds(cat.id) : [-1];
    }
    const tagSlug = req.query.tag ? blog.slugify(req.query.tag) : null;
    const [posts, total] = await Promise.all([
      blog.listPublished({ limit, offset, categoryIds, tagSlug }),
      blog.countPublished({ categoryIds, tagSlug }),
    ]);
    res.json({ posts, total, page, limit });
  } catch (e) {
    console.error('[blog] posts:', e.message);
    res.status(502).json({ error: 'db error' });
  }
});

// ── 공개: 댓글 트리 ──────────────────────────────────────────
router.get('/posts/:slug/comments', async (req, res) => {
  try {
    const post = await blog.getBySlug(req.params.slug);
    if (!post) return res.status(404).json({ error: 'not found' });
    const [comments, count] = await Promise.all([
      blog.listCommentTree(post.id), blog.commentCount(post.id),
    ]);
    res.json({ comments, count, me: publicUser(req.blogUser) });
  } catch (e) {
    console.error('[blog] comments:', e.message);
    res.status(502).json({ error: 'db error' });
  }
});

// ── 로그인 사용자: 댓글 작성 ─────────────────────────────────
router.post('/posts/:slug/comments', session.requireBlogUser, async (req, res) => {
  const body = String((req.body && req.body.body) || '').trim();
  if (!body) return res.status(400).json({ error: 'empty comment' });
  if (body.length > 5000) return res.status(400).json({ error: 'too long' });
  try {
    const post = await blog.getBySlug(req.params.slug);
    if (!post) return res.status(404).json({ error: 'not found' });
    let parentId = null;
    if (req.body.parent_id) {
      const parent = await blog.getComment(Number(req.body.parent_id));
      if (!parent || parent.post_id !== post.id) return res.status(400).json({ error: 'invalid parent' });
      parentId = parent.id;
    }
    const row = await blog.createComment({ post_id: post.id, parent_id: parentId, user_id: req.blogUser.id, body });
    res.status(201).json({
      comment: { ...row, display_name: req.blogUser.display_name, avatar_url: req.blogUser.avatar_url, is_op: req.blogUser.is_op, children: [] },
    });
  } catch (e) {
    console.error('[blog] create comment:', e.message);
    res.status(502).json({ error: 'db error' });
  }
});

// ── 로그인 사용자: 댓글 삭제(본인 또는 운영자) ───────────────
router.delete('/comments/:id', session.requireBlogUser, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid id' });
  try {
    const c = await blog.getComment(id);
    if (!c) return res.status(404).json({ error: 'not found' });
    if (c.user_id !== req.blogUser.id && !req.blogUser.is_op) return res.status(403).json({ error: 'forbidden' });
    const mode = await blog.deleteComment(id);
    res.json({ deleted: id, mode });
  } catch (e) {
    console.error('[blog] delete comment:', e.message);
    res.status(502).json({ error: 'db error' });
  }
});

// ── 공개: claps(익명, IP 레이트리밋) ─────────────────────────
const clapHits = new Map(); // ip → { n, at }
function clapAllowed(ip) {
  const now = Date.now();
  const e = clapHits.get(ip);
  if (!e || now - e.at > 60 * 1000) { clapHits.set(ip, { n: 1, at: now }); return true; }
  if (e.n >= 30) return false;
  e.n += 1; return true;
}
router.post('/posts/:slug/clap', async (req, res) => {
  if (!clapAllowed(clientIp(req))) return res.status(429).json({ error: 'too many' });
  try {
    const post = await blog.getBySlug(req.params.slug);
    if (!post) return res.status(404).json({ error: 'not found' });
    const total = await blog.addClap(post.id, 1);
    res.json({ claps: total });
  } catch (e) {
    console.error('[blog] clap:', e.message);
    res.status(502).json({ error: 'db error' });
  }
});

// ══════════════════════════════════════════════════════════════
// 관리자(requireBlogAdmin — 사람 로그인 토큰 또는 무인 MCP 서비스 토큰)
// ══════════════════════════════════════════════════════════════

// 마크다운 미리보기(관리자 에디터용) — 실제 발행과 동일 렌더러(정화 포함)
// series_id/post_id 가 함께 오면 <series> 자리도 실제 목록으로 채워서 보여준다(발행 시 렌더와 동일 동작 미리보기).
router.post('/admin/preview', requireBlogAdmin, async (req, res) => {
  const b = req.body || {};
  let html = await blog.renderMarkdown(b.body_md || '');
  if (b.series_id) html = blog.expandSeriesMount(html, await blog.renderSeriesBlock(Number(b.series_id), b.post_id ? Number(b.post_id) : null));
  res.json({ html });
});

// 글
router.get('/admin/posts', requireBlogAdmin, async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const q = req.query.q ? String(req.query.q) : null;
  const categoryId = req.query.category_id ? Number(req.query.category_id) : null;
  try {
    const [posts, total] = await Promise.all([
      blog.listAllAdmin({ limit, offset, q, categoryId }),
      blog.countAllAdmin({ q, categoryId }),
    ]);
    res.json({ posts, total });
  } catch (e) { console.error('[blog] admin posts:', e.message); res.status(502).json({ error: 'db error' }); }
});
router.get('/admin/posts/:id', requireBlogAdmin, async (req, res) => {
  try {
    const post = await blog.getById(Number(req.params.id));
    if (!post) return res.status(404).json({ error: 'not found' });
    res.json({ post, tags: await blog.tagsForPost(post.id) });
  } catch (e) { console.error('[blog] admin post:', e.message); res.status(502).json({ error: 'db error' }); }
});
router.post('/admin/posts', requireBlogAdmin, async (req, res) => {
  const b = req.body || {};
  if (!b.title && !b.body_md) return res.status(400).json({ error: 'title or body required' });
  try {
    const post = await blog.createPost(b);
    if (Array.isArray(b.tags)) await blog.setPostTags(post.id, await blog.ensureTags(b.tags));
    res.status(201).json({ post });
  } catch (e) { console.error('[blog] create post:', e.message); res.status(502).json({ error: 'db error' }); }
});
router.put('/admin/posts/:id', requireBlogAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  try {
    const post = await blog.updatePost(id, b);
    if (!post) return res.status(404).json({ error: 'not found' });
    if (Array.isArray(b.tags)) await blog.setPostTags(id, await blog.ensureTags(b.tags));
    res.json({ post });
  } catch (e) { console.error('[blog] update post:', e.message); res.status(502).json({ error: 'db error' }); }
});
router.post('/admin/posts/:id/publish', requireBlogAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const publish = (req.body || {}).publish !== false;
  try {
    const post = await blog.setStatus(id, publish);
    if (!post) return res.status(404).json({ error: 'not found' });
    res.json({ post });
  } catch (e) { console.error('[blog] publish:', e.message); res.status(502).json({ error: 'db error' }); }
});
router.delete('/admin/posts/:id', requireBlogAdmin, async (req, res) => {
  try {
    const ok = await blog.removePost(Number(req.params.id));
    if (!ok) return res.status(404).json({ error: 'not found' });
    res.json({ deleted: Number(req.params.id) });
  } catch (e) { console.error('[blog] delete post:', e.message); res.status(502).json({ error: 'db error' }); }
});

// 카테고리
router.get('/admin/categories', requireBlogAdmin, async (req, res) => {
  try { res.json({ categories: await blog.categoryTree() }); }
  catch (e) { console.error('[blog] admin cats:', e.message); res.status(502).json({ error: 'db error' }); }
});
router.post('/admin/categories', requireBlogAdmin, async (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'name required' });
  try { res.status(201).json({ category: await blog.createCategory(b) }); }
  catch (e) { console.error('[blog] create cat:', e.message); res.status(502).json({ error: 'db error (slug 중복?)' }); }
});
router.put('/admin/categories/:id', requireBlogAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  try {
    // 트리 사이클 방지: 자기 자신/자손을 상위로 지정 불가(무한 재귀 CTE 예방)
    if (b.parent_id) {
      const pid = Number(b.parent_id);
      if (pid === id) return res.status(400).json({ error: '자기 자신을 상위로 지정할 수 없습니다' });
      const desc = await blog.descendantIds(id);
      if (desc.includes(pid)) return res.status(400).json({ error: '하위 카테고리를 상위로 지정할 수 없습니다' });
    }
    const c = await blog.updateCategory(id, b);
    if (!c) return res.status(404).json({ error: 'not found' });
    res.json({ category: c });
  } catch (e) { console.error('[blog] update cat:', e.message); res.status(502).json({ error: 'db error' }); }
});
router.delete('/admin/categories/:id', requireBlogAdmin, async (req, res) => {
  try {
    const ok = await blog.removeCategory(Number(req.params.id));
    if (!ok) return res.status(404).json({ error: 'not found' });
    res.json({ deleted: Number(req.params.id) });
  } catch (e) { console.error('[blog] delete cat:', e.message); res.status(502).json({ error: 'db error' }); }
});

// 시리즈(연재물) — 카테고리와 별개, 글에 옵셔널로 부여
router.get('/admin/series', requireBlogAdmin, async (req, res) => {
  try { res.json({ series: await blog.listSeries() }); }
  catch (e) { console.error('[blog] admin series:', e.message); res.status(502).json({ error: 'db error' }); }
});
router.post('/admin/series', requireBlogAdmin, async (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'name required' });
  try { res.status(201).json({ series: await blog.createSeries(b) }); }
  catch (e) { console.error('[blog] create series:', e.message); res.status(502).json({ error: 'db error (slug 중복?)' }); }
});
router.put('/admin/series/:id', requireBlogAdmin, async (req, res) => {
  try {
    const s = await blog.updateSeries(Number(req.params.id), req.body || {});
    if (!s) return res.status(404).json({ error: 'not found' });
    res.json({ series: s });
  } catch (e) { console.error('[blog] update series:', e.message); res.status(502).json({ error: 'db error' }); }
});
router.delete('/admin/series/:id', requireBlogAdmin, async (req, res) => {
  try {
    const ok = await blog.removeSeries(Number(req.params.id));
    if (!ok) return res.status(404).json({ error: 'not found' });
    res.json({ deleted: Number(req.params.id) });
  } catch (e) { console.error('[blog] delete series:', e.message); res.status(502).json({ error: 'db error' }); }
});
router.get('/admin/series/:id/items', requireBlogAdmin, async (req, res) => {
  try { res.json({ items: await blog.seriesItems(Number(req.params.id), { includeUnpublished: true }) }); }
  catch (e) { console.error('[blog] series items:', e.message); res.status(502).json({ error: 'db error' }); }
});

// 댓글(관리자 조회/강제삭제)
router.get('/admin/comments', requireBlogAdmin, async (req, res) => {
  try {
    const { rows } = await blog.pool.query(
      `SELECT cm.id, cm.post_id, cm.body, cm.is_deleted, cm.created_at,
              p.slug AS post_slug, p.title AS post_title, u.display_name, u.is_op
       FROM blog_comments cm JOIN blog_posts p ON p.id=cm.post_id
       JOIN blog_users u ON u.id=cm.user_id
       ORDER BY cm.created_at DESC LIMIT 100`
    );
    res.json({ comments: rows });
  } catch (e) { console.error('[blog] admin comments:', e.message); res.status(502).json({ error: 'db error' }); }
});
router.delete('/admin/comments/:id', requireBlogAdmin, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const c = await blog.getComment(id);
    if (!c) return res.status(404).json({ error: 'not found' });
    const mode = await blog.deleteComment(id);
    res.json({ deleted: id, mode });
  } catch (e) { console.error('[blog] admin del comment:', e.message); res.status(502).json({ error: 'db error' }); }
});

// 사용자(운영자 승격 토글)
router.get('/admin/users', requireBlogAdmin, async (req, res) => {
  try { res.json({ users: await blog.listUsers() }); }
  catch (e) { console.error('[blog] admin users:', e.message); res.status(502).json({ error: 'db error' }); }
});
router.post('/admin/users/:id/op', requireBlogAdmin, async (req, res) => {
  try {
    const r = await blog.setUserOp(Number(req.params.id), (req.body || {}).is_op !== false);
    if (!r) return res.status(404).json({ error: 'not found' });
    res.json({ user: r });
  } catch (e) { console.error('[blog] set op:', e.message); res.status(502).json({ error: 'db error' }); }
});

// 태그 삭제(관리자)
router.delete('/admin/tags/:id', requireBlogAdmin, async (req, res) => {
  try {
    const { rowCount } = await blog.pool.query('DELETE FROM blog_tags WHERE id=$1', [Number(req.params.id)]);
    if (!rowCount) return res.status(404).json({ error: 'not found' });
    res.json({ deleted: Number(req.params.id) });
  } catch (e) { console.error('[blog] del tag:', e.message); res.status(502).json({ error: 'db error' }); }
});

// ── 이미지 라이브러리 (관리자) ────────────────────────────────
// 업로드: multipart(file) + 옵션 post_id. → /app/cdn/blog/<postId|_tmp>/<uuid>.<ext> 저장, blog_images insert.
router.post('/admin/images', requireBlogAdmin, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '이미지 파일이 없거나 형식 미지원(jpg/png/webp/gif/avif)' });
  const ext = IMG_EXT[req.file.mimetype];
  const pid = Number(req.body && req.body.post_id) || null;
  const bucket = pid ? String(pid) : '_tmp';
  const name = `${crypto.randomUUID()}.${ext}`;
  const dir = path.join(BLOG_IMG_ROOT, bucket);
  const filepath = path.join(dir, name);
  const url = `/cdn/blog/${bucket}/${name}`;
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filepath, req.file.buffer);
    const img = await blog.createImage({
      post_id: pid, url, filepath, filename: req.file.originalname, bytes: req.file.size,
    });
    res.status(201).json({ image: { id: img.id, url, filename: img.filename, bytes: img.bytes } });
  } catch (e) {
    console.error('[blog] upload image:', e.message);
    res.status(502).json({ error: 'upload failed' });
  }
});

// 포스트 이미지 라이브러리(미귀속 임시 업로드 포함) — MCP blog_list_images 용
router.get('/admin/posts/:id/images', requireBlogAdmin, async (req, res) => {
  try { res.json({ images: await blog.imagesForPost(Number(req.params.id)) }); }
  catch (e) { console.error('[blog] list images:', e.message); res.status(502).json({ error: 'db error' }); }
});

// 정확히 이 포스트에만 귀속된 이미지(미귀속 제외) — 에디터 기본 스코프
router.get('/admin/posts/:id/images/strict', requireBlogAdmin, async (req, res) => {
  try { res.json({ images: await blog.imagesForPostStrict(Number(req.params.id)) }); }
  catch (e) { console.error('[blog] list images (strict):', e.message); res.status(502).json({ error: 'db error' }); }
});

// 전체 이미지(모든 글 + 미귀속) 조회
router.get('/admin/images/all', requireBlogAdmin, async (req, res) => {
  try { res.json({ images: await blog.allImages() }); }
  catch (e) { console.error('[blog] list images (all):', e.message); res.status(502).json({ error: 'db error' }); }
});

// 미사용 이미지 정리: 어떤 글에도 안 쓰인 이미지를 .trash 로 mv + DB 행 삭제(안전 삭제).
router.post('/admin/images/trash-unused', requireBlogAdmin, async (req, res) => {
  try {
    const unused = await blog.unusedImages();
    fs.mkdirSync(TRASH_ROOT, { recursive: true });
    const trashed = [];
    for (const img of unused) {
      try {
        if (fs.existsSync(img.filepath)) {
          fs.renameSync(img.filepath, path.join(TRASH_ROOT, `${Date.now()}_${path.basename(img.filepath)}`));
        }
        trashed.push(img.id);
      } catch (e) { console.error('[blog] trash mv:', img.filepath, e.message); }
    }
    await blog.deleteImageRows(trashed);
    res.json({ trashed: trashed.length });
  } catch (e) {
    console.error('[blog] trash-unused:', e.message);
    res.status(502).json({ error: 'trash failed' });
  }
});

// 휴지통 목록 / 비우기(실제 rm)
router.get('/admin/trash', requireBlogAdmin, (req, res) => {
  try {
    const files = fs.existsSync(TRASH_ROOT)
      ? fs.readdirSync(TRASH_ROOT).map((f) => ({ name: f, bytes: fs.statSync(path.join(TRASH_ROOT, f)).size }))
      : [];
    res.json({ files, count: files.length });
  } catch (e) { console.error('[blog] trash list:', e.message); res.status(502).json({ error: 'trash error' }); }
});
router.post('/admin/trash/empty', requireBlogAdmin, (req, res) => {
  try {
    let removed = 0;
    if (fs.existsSync(TRASH_ROOT)) {
      for (const f of fs.readdirSync(TRASH_ROOT)) { fs.unlinkSync(path.join(TRASH_ROOT, f)); removed += 1; }
    }
    res.json({ removed });
  } catch (e) { console.error('[blog] trash empty:', e.message); res.status(502).json({ error: 'trash error' }); }
});

module.exports = router;
