// 블로그 SSR 읽기 페이지 + RSS. 크롤러가 완성 HTML/OG 태그를 받도록 서버렌더.
// 마운트: app.use('/blog', blogRouter) → nginx /blog location.
const express = require('express');
const blog = require('../db/blog');
const session = require('../blogSession');

const router = express.Router();
router.use(session.attachBlogUser); // 헤더에 로그인 상태 표시용
// SSR 페이지는 로그인 상태(아바타·OP·admin 메뉴)가 들어가는 개인화 응답 → 캐시 금지(rss 제외)
router.use((req, res, next) => {
  if (req.path !== '/rss.xml' && req.path !== '/sitemap.xml') res.set('Cache-Control', 'no-store');
  next();
});

const PER_PAGE = 12;
const SITE_TITLE = 'VOID // Blog';

function meUser(req) {
  const u = req.blogUser;
  return u ? { id: u.id, name: u.display_name, avatar: u.avatar_url, is_op: u.is_op } : null;
}
function catUrl(pathSegs) { return '/blog/category/' + pathSegs.map(encodeURIComponent).join('/'); }
// 자기 참조 canonical(쿼리 포함) — 목록/카테고리/태그 페이지용
function absUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${req.headers['host']}${req.originalUrl}`;
}
function notFound(res, msg) {
  res.status(404).type('html').send(
    `<!doctype html><meta charset=utf-8><title>404</title>` +
    `<div style="font-family:system-ui;max-width:520px;margin:15vh auto;text-align:center;color:#3d3d3a">` +
    `<h1 style="font-size:48px;color:#37568c;margin:0">404</h1><p>${msg}</p>` +
    `<p><a href="/blog" style="color:#37568c">← 블로그로</a></p></div>`
  );
}

// ── RSS 2.0 ──────────────────────────────────────────────────
function xmlEscape(s) {
  return String(s || '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}
router.get('/rss.xml', async (req, res) => {
  try {
    const posts = await blog.listPublished({ limit: 30, offset: 0 });
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const base = `${proto}://${req.headers['host']}`;
    const items = posts.map((p) => `
    <item>
      <title>${xmlEscape(p.title)}</title>
      <link>${base}/blog/${encodeURIComponent(p.slug)}</link>
      <guid isPermaLink="true">${base}/blog/${encodeURIComponent(p.slug)}</guid>
      <description>${xmlEscape(p.summary || '')}</description>
      ${p.category_name ? `<category>${xmlEscape(p.category_name)}</category>` : ''}
      <pubDate>${new Date(p.published_at || p.created_at).toUTCString()}</pubDate>
    </item>`).join('');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>${xmlEscape(SITE_TITLE)}</title>
  <link>${base}/blog</link>
  <description>doil.me 블로그</description>
  <language>ko</language>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>${items}
</channel></rss>`;
    res.type('application/rss+xml').send(xml);
  } catch (e) {
    console.error('[blog] rss:', e.message);
    res.status(502).send('rss error');
  }
});

// ── sitemap.xml (발행글 KO+EN + 카테고리 + 태그, lastmod) ─────
router.get('/sitemap.xml', async (req, res) => {
  try {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const base = `${proto}://${req.headers['host']}`;
    const iso = (d) => new Date(d).toISOString();
    const [{ rows: posts }, cats, tags] = await Promise.all([
      blog.pool.query(
        `SELECT slug, updated_at, published_at, (body_html_en IS NOT NULL) AS has_en
         FROM blog_posts WHERE status='published' AND noindex = false ORDER BY published_at DESC NULLS LAST`
      ),
      blog.categoryTree(),
      blog.listTags(),
    ]);
    const byId = new Map(cats.map((c) => [c.id, c]));
    const catSegs = (c) => { const s = []; let cur = c; while (cur) { s.unshift(cur.slug); cur = cur.parent_id ? byId.get(cur.parent_id) : null; } return s; };
    const urls = [`<url><loc>${base}/blog</loc></url>`];
    for (const p of posts) {
      const enc = encodeURIComponent(p.slug);
      const lm = `<lastmod>${iso(p.updated_at || p.published_at)}</lastmod>`;
      urls.push(`<url><loc>${base}/blog/${enc}</loc>${lm}</url>`);
      if (p.has_en) urls.push(`<url><loc>${base}/blog/en/${enc}</loc>${lm}</url>`);
    }
    for (const c of cats) urls.push(`<url><loc>${base}${catUrl(catSegs(c))}</loc></url>`);
    for (const t of tags) urls.push(`<url><loc>${base}/blog/tag/${encodeURIComponent(t.slug)}</loc></url>`);
    res.type('application/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`
    );
  } catch (e) {
    console.error('[blog] sitemap:', e.message);
    res.status(502).send('sitemap error');
  }
});

// ── 목록(홈) ─────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const [posts, total, categories, tags] = await Promise.all([
      blog.listPublished({ limit: PER_PAGE, offset: (page - 1) * PER_PAGE }),
      blog.countPublished({}),
      blog.categoryTree(),
      blog.listTags(),
    ]);
    // 루트 드릴다운: 최상위 카테고리
    const drillCats = categories.filter((c) => !c.parent_id).map((c) => ({ name: c.name, url: catUrl([c.slug]) }));
    res.render('blog/list', {
      layout: false, title: SITE_TITLE, heading: 'Posts', subheading: '생각의 파편들 · 리뷰 · 기록',
      posts, categories, tags, drillCats, breadcrumb: [], activeTag: null,
      pagination: { page, total, limit: PER_PAGE, baseUrl: '/blog' },
      user: meUser(req), catUrl, canonical: absUrl(req),
    });
  } catch (e) {
    console.error('[blog] index:', e.message);
    res.status(502).send('blog error');
  }
});

// ── 태그별 ───────────────────────────────────────────────────
router.get('/tag/:tag', async (req, res) => {
  try {
    const tagSlug = blog.slugify(req.params.tag);
    const tag = await blog.getTagBySlug(tagSlug);
    const page = Math.max(1, Number(req.query.page) || 1);
    const [posts, total, categories, tags] = await Promise.all([
      blog.listPublished({ limit: PER_PAGE, offset: (page - 1) * PER_PAGE, tagSlug }),
      blog.countPublished({ tagSlug }),
      blog.categoryTree(),
      blog.listTags(),
    ]);
    const drillCats = categories.filter((c) => !c.parent_id).map((c) => ({ name: c.name, url: catUrl([c.slug]) }));
    res.render('blog/list', {
      layout: false, title: `#${tag ? tag.name : req.params.tag} · ${SITE_TITLE}`,
      heading: `#${tag ? tag.name : req.params.tag}`, subheading: `${total}개의 글`,
      posts, categories, tags, drillCats, breadcrumb: [], activeTag: tagSlug,
      pagination: { page, total, limit: PER_PAGE, baseUrl: `/blog/tag/${encodeURIComponent(req.params.tag)}` },
      user: meUser(req), catUrl, canonical: absUrl(req),
    });
  } catch (e) {
    console.error('[blog] tag:', e.message);
    res.status(502).send('blog error');
  }
});

// ── 카테고리별(계층 경로) ────────────────────────────────────
router.get('/category/*splat', async (req, res) => {
  try {
    // express5(path-to-regexp v8): *splat 는 세그먼트 배열(이미 URL 디코드됨)
    const raw = req.params.splat;
    const segs = (Array.isArray(raw) ? raw : String(raw || '').split('/')).filter(Boolean);
    const cat = await blog.resolveCategoryPath(segs);
    if (!cat) return notFound(res, '카테고리를 찾을 수 없습니다.');
    const ids = await blog.descendantIds(cat.id);
    const crumb = await blog.categoryPath(cat.id);
    const page = Math.max(1, Number(req.query.page) || 1);
    const [posts, total, categories, tags] = await Promise.all([
      blog.listPublished({ limit: PER_PAGE, offset: (page - 1) * PER_PAGE, categoryIds: ids }),
      blog.countPublished({ categoryIds: ids }),
      blog.categoryTree(),
      blog.listTags(),
    ]);
    // breadcrumb: 누적 경로 URL 생성
    const breadcrumb = [];
    const acc = [];
    for (const c of crumb) { acc.push(c.slug); breadcrumb.push({ name: c.name, url: catUrl([...acc]) }); }
    // 드릴다운: 현재 카테고리의 하위 카테고리(더 깊이 파고들기)
    const drillCats = categories.filter((c) => c.parent_id === cat.id).map((c) => ({ name: c.name, url: catUrl([...segs, c.slug]) }));
    res.render('blog/list', {
      layout: false, title: `${cat.name} · ${SITE_TITLE}`, heading: cat.name,
      subheading: `${total}개의 글`, posts, categories, tags, drillCats, breadcrumb, activeTag: null,
      pagination: { page, total, limit: PER_PAGE, baseUrl: catUrl(segs) },
      user: meUser(req), catUrl, canonical: absUrl(req),
    });
  } catch (e) {
    console.error('[blog] category:', e.message);
    res.status(502).send('blog error');
  }
});

// ── About(소개) ──────────────────────────────────────────────
router.get('/about', (req, res) => {
  res.render('blog/about', { layout: false, title: `About · ${SITE_TITLE}`, user: meUser(req) });
});

// ── 개인정보처리방침 ─────────────────────────────────────────
router.get('/privacy', (req, res) => {
  res.render('blog/privacy', { layout: false, title: `개인정보처리방침 · ${SITE_TITLE}`, user: meUser(req) });
});

// ── 전체 태그 인덱스(실시간 클라 필터) ───────────────────────
router.get('/tags', async (req, res) => {
  try {
    const tags = await blog.listTags(); // post_count DESC, name
    res.render('blog/tags', {
      layout: false, title: `Tags · ${SITE_TITLE}`,
      tags, user: meUser(req), canonical: absUrl(req),
    });
  } catch (e) {
    console.error('[blog] tags page:', e.message);
    res.status(502).send('blog error');
  }
});

// ── 글 상세 (KO 기본 /blog/:slug · EN /blog/en/:slug) ─────────
// 한 논리 포스트를 언어별로 렌더. EN 은 body_html_en 이 있을 때만 유효(없으면 404).
// 두 URL 은 상호 hreflang(ko/en/x-default) + 각자 canonical → 구글이 번역쌍으로 인식(중복 아님).
async function renderPost(req, res, lang) {
  try {
    const post = await blog.getBySlug(req.params.slug);
    if (!post) return notFound(res, '글을 찾을 수 없습니다.');
    const hasEn = !!post.body_html_en;
    if (lang === 'en' && !hasEn) return notFound(res, 'No English version for this post.');

    blog.incrementView(post.id).catch(() => {});
    const [tags, claps, commentCount, categories, author, seriesBlockHtml, adjacent] = await Promise.all([
      blog.tagsForPost(post.id), blog.getClaps(post.id), blog.commentCount(post.id), blog.categoryTree(), blog.getOwner(),
      post.series_id ? blog.renderSeriesBlock(post.series_id, post.id) : Promise.resolve(''),
      blog.adjacentPosts(post),
    ]);
    let breadcrumb = [];
    if (post.category_id) {
      const crumb = await blog.categoryPath(post.category_id);
      const acc = [];
      breadcrumb = crumb.map((c) => { acc.push(c.slug); return { name: c.name, url: catUrl([...acc]) }; });
    }
    // EN 렌더 시 표시 필드를 EN 값으로 스왑(본문/제목/요약). 댓글·claps·태그는 논리 포스트 공유.
    const readMd = lang === 'en' ? post.body_md_en : post.body_md;
    if (lang === 'en') {
      post.title = post.title_en || post.title;
      post.summary = post.summary_en || post.summary;
      post.body_html = post.body_html_en;
    }
    // <series> 마운트를 "지금 시점" 최신 시리즈 목록으로 치환(발행 시 고정이 아니라 매 조회마다 최신 반영).
    post.body_html = blog.expandSeriesMount(post.body_html, seriesBlockHtml);
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const origin = `${proto}://${req.headers['host']}`;
    const enc = encodeURIComponent(post.slug);
    const koUrl = `${origin}/blog/${enc}`;
    const enUrl = `${origin}/blog/en/${enc}`;
    const selfUrl = lang === 'en' ? enUrl : koUrl;
    res.render('blog/post', {
      layout: false, title: `${post.title} · ${SITE_TITLE}`,
      post, tags, claps, commentCount, categories, breadcrumb, ogUrl: selfUrl, author,
      readMinutes: Math.max(1, Math.ceil((readMd || '').length / 500)),
      og: { title: post.title, description: post.summary, url: selfUrl, image: post.cover_url || '/cdn/blog/_static/cover-placeholder.svg' },
      user: meUser(req), catUrl,
      lang, hasEn, koUrl, enUrl, htmlLang: lang,
      noindex: !!post.noindex,
      canonical: selfUrl,
      alt: { ko: koUrl, en: hasEn ? enUrl : null },
      prevPost: adjacent.prev, nextPost: adjacent.next,
    });
  } catch (e) {
    console.error('[blog] post:', e.message);
    res.status(502).send('blog error');
  }
}

// EN 은 /:slug 보다 먼저 등록(라우트 우선순위)
router.get('/en/:slug', (req, res) => renderPost(req, res, 'en'));
router.get('/:slug', (req, res) => renderPost(req, res, 'ko'));

module.exports = router;
