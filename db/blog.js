// 블로그 CMS 데이터 접근 — 공유 dev DB. 카테고리(계층)/글/태그/댓글(스레드)/유저/claps.
// 마크다운 렌더는 발행 시점에만 수행(marked → sanitize-html) 후 body_html 저장.
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { marked } = require('marked');
const { markedHighlight } = require('marked-highlight');
const hljs = require('highlight.js');
const sanitizeHtml = require('sanitize-html');

const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'doil',
  password: process.env.DB_PASSWORD || 'doildev1!',
  database: process.env.DB_NAME || 'dev',
  max: 4,
});
pool.on('error', (e) => console.error('[blog db] pool error:', e.message));

async function ensureSchema() {
  const sql = fs.readFileSync(path.join(__dirname, 'blog.sql'), 'utf8');
  await pool.query(sql);
}

// ── 마크다운 렌더(+정화) ──────────────────────────────────────
// 코드블록은 발행 시점에 서버에서 highlight.js 로 구문강조를 굳혀(body_html) 저장한다.
// → 읽기 페이지는 정적·빠름·CSP 안전. 강조용 span/class 는 sanitize 화이트리스트에서 허용됨.
marked.use(markedHighlight({
  langPrefix: 'hljs language-',
  highlight(code, lang) {
    const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
    return hljs.highlight(code, { language }).value;
  },
}));
marked.setOptions({ gfm: true, breaks: false });
const SANITIZE_OPTS = {
  allowedTags: [
    'h1','h2','h3','h4','h5','h6','p','a','ul','ol','li','blockquote',
    'code','pre','em','strong','del','hr','br','img','table','thead',
    'tbody','tr','th','td','span','figure','figcaption','iframe',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel', 'class'],
    img: ['src', 'alt', 'title'],
    code: ['class'],
    span: ['class'],
    figure: ['class'],
    iframe: ['src', 'width', 'height', 'frameborder', 'allow', 'allowfullscreen', 'referrerpolicy', 'title'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'data'],
  // iframe 은 유튜브만 허용(임의 사이트 임베드로 인한 clickjacking/XSS 표면 방지)
  allowedIframeHostnames: ['www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com', 'youtube-nocookie.com'],
  transformTags: {
    // 외부 링크는 새 탭 + noopener
    a: (tagName, attribs) => {
      if (attribs.href && /^https?:\/\//i.test(attribs.href)) {
        attribs.target = '_blank';
        attribs.rel = 'noopener noreferrer';
      }
      return { tagName, attribs };
    },
  },
};
// ── 링크 임베드 카드(<link-card src="URL">) ──────────────────
// body_md 안의 <link-card src="URL"> 태그를 렌더 시점에 OG 메타(제목·설명·썸네일) fetch 해
// <figure class="link-card"> 블록으로 치환한다. 결과는 URL 별로 메모리 캐시(TTL 1시간)해
// 미리보기 디바운스(300ms)마다 매번 재요청하지 않도록 한다.
const OG_CACHE = new Map(); // url -> { data, ts }
const OG_CACHE_TTL = 60 * 60 * 1000;
const OG_FETCH_TIMEOUT = 5000;
const LINK_CARD_RE = /<link-card\s+src=["']([^"']+)["']\s*\/?>/gi;

function decodeHtmlEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'");
}
function extractMeta(html, prop) {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']` +
    `|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`,
    'i'
  );
  const m = html.match(re);
  return m ? decodeHtmlEntities((m[1] ?? m[2] ?? '').trim()) : null;
}
function extractTitleTag(html) {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? decodeHtmlEntities(m[1].trim()) : null;
}
function urlDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}
async function fetchOgMeta(url) {
  const cached = OG_CACHE.get(url);
  if (cached && Date.now() - cached.ts < OG_CACHE_TTL) return cached.data;
  let data;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), OG_FETCH_TIMEOUT);
    let resp;
    try {
      resp = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; doil.me-linkcard/1.0)' } });
    } finally { clearTimeout(timer); }
    const html = (await resp.text()).slice(0, 300000); // 과도한 응답 방어
    data = {
      title: extractMeta(html, 'og:title') || extractTitleTag(html) || url,
      description: extractMeta(html, 'og:description') || extractMeta(html, 'description') || '',
      image: extractMeta(html, 'og:image') || null,
      domain: urlDomain(url),
    };
  } catch (e) {
    console.error('[blog] link-card og fetch failed:', url, e.message);
    data = { title: url, description: '', image: null, domain: urlDomain(url) };
  }
  OG_CACHE.set(url, { data, ts: Date.now() });
  if (OG_CACHE.size > 500) OG_CACHE.delete(OG_CACHE.keys().next().value);
  return data;
}
function escAttr(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function renderLinkCardHtml(url, meta) {
  const img = meta.image ? `<img src="${escAttr(meta.image)}" alt="">` : '';
  const desc = meta.description ? `<span class="lc-desc">${escAttr(meta.description)}</span>` : '';
  return `<figure class="link-card"><a href="${escAttr(url)}" target="_blank" rel="noopener noreferrer">${img}<figcaption>` +
    `<span class="lc-title">${escAttr(meta.title)}</span>${desc}<span class="lc-domain">${escAttr(meta.domain)}</span>` +
    `</figcaption></a></figure>`;
}
async function expandLinkCards(md) {
  const urls = [...new Set([...md.matchAll(LINK_CARD_RE)].map((m) => m[1]))];
  if (!urls.length) return md;
  const metaByUrl = new Map();
  await Promise.all(urls.map(async (u) => metaByUrl.set(u, await fetchOgMeta(u))));
  return md.replace(LINK_CARD_RE, (whole, url) => renderLinkCardHtml(url, metaByUrl.get(url)));
}

// ── 수식($...$/$$...$$) 보호 ──────────────────────────────────
// CommonMark는 백슬래시+구두점(\{, \} 등)을 이스케이프로 해석해 백슬래시를 삭제한다.
// LaTeX 원문이 marked를 거치며 깨지지 않도록, 렌더 전에 수식 구간을 플레이스홀더로 빼두었다가
// 렌더 후 원문 그대로(HTML 엔티티만 이스케이프) 복원한다. 실제 수식 렌더링은 클라이언트 KaTeX가 담당.
const MATH_RE = /\$\$[\s\S]+?\$\$|\$[^\$\n]+?\$/g;
function protectMath(md) {
  const store = [];
  const protectedMd = md.replace(MATH_RE, (m) => {
    store.push(m);
    return `XMATHPLACEHOLDER${store.length - 1}X`;
  });
  return { protectedMd, store };
}
function restoreMath(html, store) {
  return html.replace(/XMATHPLACEHOLDER(\d+)X/g, (_, i) => escAttr(store[Number(i)]));
}

// ── 시리즈(<series> 태그) 자리표시 ───────────────────────────
// 본문 중 <series> 는 저장 시점이 아니라 "매 페이지 뷰"에 최신 목록으로 채워야 하므로
// (나중에 추가된 회차도 이전 글들에 자동 반영되어야 함) 렌더 시엔 안정적인 마운트 placeholder만 남기고,
// 실제 목록 HTML은 routes/blog.js 가 페이지 렌더 시점에 주입한다.
const SERIES_TAG_RE = /<series\s*\/?>/gi;
const SERIES_MOUNT_HTML = '<div class="series-mount"></div>';
function protectSeriesTag(md) {
  let has = false;
  const protectedMd = md.replace(SERIES_TAG_RE, () => { has = true; return 'XSERIESPLACEHOLDERX'; });
  return { protectedMd, has };
}
function restoreSeriesTag(html, has) {
  if (!has) return html;
  return html.replace(/<p>\s*XSERIESPLACEHOLDERX\s*<\/p>/g, SERIES_MOUNT_HTML);
}

async function renderMarkdown(md) {
  const { protectedMd: mathProtected, store } = protectMath(String(md || ''));
  const { protectedMd, has: hasSeries } = protectSeriesTag(mathProtected);
  const expanded = await expandLinkCards(protectedMd);
  let html = sanitizeHtml(marked.parse(expanded), SANITIZE_OPTS);
  html = restoreMath(html, store);
  html = restoreSeriesTag(html, hasSeries);
  return html;
}

// 순수 텍스트 발췌(summary 자동 생성용) — HTML/마크다운 제거 후 앞부분
function autoSummary(md, len = 180) {
  const text = sanitizeHtml(marked.parse(String(md || '')), { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, ' ').trim();
  return text.length > len ? text.slice(0, len) + '…' : text;
}

// slug 정규화 — 한글 허용(유니코드), 공백→하이픈, 위험문자 제거
function slugify(s) {
  return String(s || '').trim().toLowerCase()
    .replace(/[\s]+/g, '-')
    .replace(/[^\p{L}\p{N}\-_]/gu, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'post';
}

// ── 카테고리 ──────────────────────────────────────────────────
async function categoryTree() {
  const { rows } = await pool.query(
    'SELECT id, parent_id, slug, name, sort_order FROM blog_categories ORDER BY parent_id NULLS FIRST, sort_order, id'
  );
  return rows;
}

// 경로 세그먼트 배열(['reviews','matjip','jeonju'])로 말단 카테고리 확정
async function resolveCategoryPath(segments) {
  let parentId = null;
  let node = null;
  for (const seg of segments) {
    const { rows } = await pool.query(
      `SELECT * FROM blog_categories WHERE slug=$1 AND parent_id IS NOT DISTINCT FROM $2 LIMIT 1`,
      [seg, parentId]
    );
    if (!rows[0]) return null;
    node = rows[0];
    parentId = node.id;
  }
  return node;
}

// 자기 + 모든 후손 id (재귀 CTE) — 카테고리 그루핑 조회용
async function descendantIds(categoryId) {
  const { rows } = await pool.query(
    `WITH RECURSIVE sub AS (
       SELECT id FROM blog_categories WHERE id=$1
       UNION ALL
       SELECT c.id FROM blog_categories c JOIN sub ON c.parent_id = sub.id
     ) SELECT id FROM sub`,
    [categoryId]
  );
  return rows.map((r) => r.id);
}

// 말단→루트 경로(breadcrumb용)
async function categoryPath(categoryId) {
  const { rows } = await pool.query(
    `WITH RECURSIVE up AS (
       SELECT id, parent_id, slug, name FROM blog_categories WHERE id=$1
       UNION ALL
       SELECT c.id, c.parent_id, c.slug, c.name FROM blog_categories c JOIN up ON c.id = up.parent_id
     ) SELECT id, slug, name FROM up`,
    [categoryId]
  );
  return rows.reverse(); // 루트→말단
}

async function createCategory({ parent_id, slug, name, sort_order }) {
  const { rows } = await pool.query(
    `INSERT INTO blog_categories (parent_id, slug, name, sort_order)
     VALUES ($1,$2,$3,COALESCE($4,0)) RETURNING id, parent_id, slug, name, sort_order`,
    [parent_id || null, slugify(slug || name), name, sort_order]
  );
  return rows[0];
}
async function updateCategory(id, { parent_id, slug, name, sort_order }) {
  const { rows } = await pool.query(
    `UPDATE blog_categories SET
       parent_id = $2, slug = COALESCE($3, slug), name = COALESCE($4, name),
       sort_order = COALESCE($5, sort_order)
     WHERE id=$1 RETURNING id, parent_id, slug, name, sort_order`,
    [id, parent_id ?? null, slug ? slugify(slug) : null, name ?? null, sort_order]
  );
  return rows[0] || null;
}
// 삭제 시 서브트리를 잃지 않도록 "승격" 처리(linked): 이 카테고리의 글·하위 카테고리를
// 이 카테고리의 상위(parent)로 재연결한 뒤 삭제. 상위가 없으면(최상위 삭제) 글은 카테고리 없음(NULL),
// 하위 카테고리는 최상위로 승격. FK cascade 로 서브트리가 통째로 지워지는 것을 막기 위해 삭제 전에 재연결한다.
async function removeCategory(id) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT parent_id FROM blog_categories WHERE id=$1', [id]);
    if (!rows[0]) { await client.query('ROLLBACK'); return false; }
    const parentId = rows[0].parent_id; // null 이면 최상위
    // 이 카테고리를 쓰던 글 → 상위로 승격(상위 없으면 NULL = 카테고리 없음)
    await client.query('UPDATE blog_posts SET category_id=$2 WHERE category_id=$1', [id, parentId]);
    // 이 카테고리의 하위 카테고리 → 상위로 승격(한 단계 위로). cascade 삭제 방지를 위해 삭제 전에 재부모화.
    await client.query('UPDATE blog_categories SET parent_id=$2 WHERE parent_id=$1', [id, parentId]);
    const del = await client.query('DELETE FROM blog_categories WHERE id=$1', [id]);
    await client.query('COMMIT');
    return del.rowCount > 0;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ── 태그 ──────────────────────────────────────────────────────
async function listTags() {
  const { rows } = await pool.query(
    `SELECT t.id, t.slug, t.name, COUNT(pt.post_id)::int AS post_count
     FROM blog_tags t LEFT JOIN blog_post_tags pt ON pt.tag_id = t.id
     GROUP BY t.id ORDER BY post_count DESC, t.name`
  );
  return rows;
}
// 태그 이름 배열 → id 배열(없으면 생성)
async function ensureTags(names) {
  const ids = [];
  for (const raw of names || []) {
    const name = String(raw).replace(/^#/, '').trim();
    if (!name) continue;
    const slug = slugify(name);
    const { rows } = await pool.query(
      `INSERT INTO blog_tags (slug, name) VALUES ($1,$2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [slug, name]
    );
    ids.push(rows[0].id);
  }
  return ids;
}
async function setPostTags(postId, tagIds) {
  await pool.query('DELETE FROM blog_post_tags WHERE post_id=$1', [postId]);
  for (const tid of tagIds) {
    await pool.query(
      'INSERT INTO blog_post_tags (post_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [postId, tid]
    );
  }
}
async function tagsForPost(postId) {
  const { rows } = await pool.query(
    `SELECT t.id, t.slug, t.name FROM blog_tags t
     JOIN blog_post_tags pt ON pt.tag_id = t.id WHERE pt.post_id=$1 ORDER BY t.name`,
    [postId]
  );
  return rows;
}
async function getTagBySlug(slug) {
  const { rows } = await pool.query('SELECT id, slug, name FROM blog_tags WHERE slug=$1', [slug]);
  return rows[0] || null;
}

// ── 시리즈(연재물) ────────────────────────────────────────────
// series_order 검증: 정수 세그먼트를 '-'로 연결한 트리 순서만 허용(예: "1", "1-2", "2-1-3").
const SERIES_ORDER_RE = /^\d+(-\d+)*$/;
function normalizeSeriesOrder(order) {
  const s = String(order || '').trim();
  if (!s) return null;
  if (!SERIES_ORDER_RE.test(s)) throw new Error(`잘못된 시리즈 순서 형식: ${s} (예: 1, 1-2, 2-1-3)`);
  return s;
}
async function listSeries() {
  const { rows } = await pool.query(
    `SELECT s.*, COUNT(p.id)::int AS post_count
     FROM blog_series s LEFT JOIN blog_posts p ON p.series_id = s.id
     GROUP BY s.id ORDER BY s.name`
  );
  return rows;
}
async function getSeriesById(id) {
  if (!id) return null;
  const { rows } = await pool.query('SELECT * FROM blog_series WHERE id=$1', [id]);
  return rows[0] || null;
}
async function createSeries({ name, slug, chapter_labels }) {
  const { rows } = await pool.query(
    `INSERT INTO blog_series (slug, name, chapter_labels) VALUES ($1,$2,$3::jsonb) RETURNING *`,
    [slugify(slug || name), name, JSON.stringify(chapter_labels || {})]
  );
  return rows[0];
}
async function updateSeries(id, { name, slug, chapter_labels }) {
  const { rows } = await pool.query(
    `UPDATE blog_series SET name=COALESCE($2,name), slug=COALESCE($3,slug),
       chapter_labels=COALESCE($4::jsonb, chapter_labels)
     WHERE id=$1 RETURNING *`,
    [id, name ?? null, slug ? slugify(slug) : null, chapter_labels !== undefined ? JSON.stringify(chapter_labels) : null]
  );
  return rows[0] || null;
}
async function removeSeries(id) {
  // 이 시리즈를 쓰던 글은 FK ON DELETE SET NULL 로 series_id/무관하게 남고, series_order 만 별도 정리.
  await pool.query('UPDATE blog_posts SET series_order=NULL WHERE series_id=$1', [id]);
  const { rowCount } = await pool.query('DELETE FROM blog_series WHERE id=$1', [id]);
  return rowCount > 0;
}
// 시리즈 소속 글 목록 — series_order 를 정수 배열로 캐스팅해 트리 순서로 정렬(문자열 정렬 시 "10" < "2" 오류 방지).
async function seriesItems(seriesId, { includeUnpublished = false } = {}) {
  if (!seriesId) return [];
  const statusClause = includeUnpublished ? '' : `AND status='published'`;
  const { rows } = await pool.query(
    `SELECT id, slug, title, series_order
     FROM blog_posts
     WHERE series_id=$1 ${statusClause}
     ORDER BY string_to_array(COALESCE(series_order,'0'), '-')::int[]`,
    [seriesId]
  );
  return rows;
}
// series_order("1-2-3")를 '-'로 쪼개 실제 트리로 묶어 중첩 <ul> 렌더 — 숫자 라벨 대신 들여쓰기로 depth 표현.
// 중간 세그먼트에 글이 없어도(예: "1"엔 글 없이 "1-1".."1-8"만 있음) 빈 <li>로 그 자손들을 묶어 depth를 살린다.
function buildSeriesTree(items) {
  const root = { children: new Map() };
  for (const it of items) {
    let node = root;
    for (const seg of (it.series_order || '0').split('-')) {
      if (!node.children.has(seg)) node.children.set(seg, { children: new Map(), post: null });
      node = node.children.get(seg);
    }
    node.post = it;
  }
  return root;
}
// path: 루트부터 지금 노드까지의 '-' 결합 경로("1", "1-2" …) — 글 없는 챕터 노드에 chapter_labels 매칭용.
function renderSeriesTreeNode(node, currentPostId, labels, pathPrefix) {
  const entries = [...node.children.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));
  if (!entries.length) return '';
  const items = entries.map(([seg, child]) => {
    const path = pathPrefix ? `${pathPrefix}-${seg}` : seg;
    let label;
    if (child.post) {
      label = child.post.id === currentPostId
        ? `<span class="current">${escAttr(child.post.title)}</span>`
        : `<a href="/blog/${encodeURIComponent(child.post.slug)}">${escAttr(child.post.title)}</a>`;
    } else {
      const chapterLabel = labels && labels[path];
      label = chapterLabel ? `<span class="series-chapter">${escAttr(chapterLabel)}</span>` : '';
    }
    return `<li>${label}${renderSeriesTreeNode(child, currentPostId, labels, path)}</li>`;
  }).join('');
  return `<ul class="series-tree">${items}</ul>`;
}
function renderSeriesBlockHtml(series, items, currentPostId) {
  const tree = renderSeriesTreeNode(buildSeriesTree(items), currentPostId, series.chapter_labels || {}, '');
  return `<div class="series-box"><div class="series-box-title">📚 시리즈: ${escAttr(series.name)}</div>${tree}</div>`;
}
// <series> 마운트를 실제 목록 HTML로 치환(페이지 렌더 시점 호출 — 항상 최신 목록 반영).
async function renderSeriesBlock(seriesId, currentPostId) {
  const series = await getSeriesById(seriesId);
  if (!series) return '';
  const items = await seriesItems(seriesId);
  return renderSeriesBlockHtml(series, items, currentPostId);
}
function expandSeriesMount(html, blockHtml) {
  if (!html.includes('series-mount')) return html;
  return html.replace(/<div class="series-mount"><\/div>/g, blockHtml || '');
}

// 이전/다음 글 — 시리즈 소속이면 시리즈 내 순서로, 아니면 카테고리(없으면 전체) 발행일 기준으로.
async function adjacentPosts(post) {
  if (post.series_id) {
    const items = await seriesItems(post.series_id);
    const idx = items.findIndex((it) => it.id === post.id);
    return {
      prev: idx > 0 ? items[idx - 1] : null,
      next: idx >= 0 && idx < items.length - 1 ? items[idx + 1] : null,
    };
  }
  const catClause = post.category_id ? 'AND category_id = $3' : '';
  const params = post.category_id ? [post.id, post.published_at, post.category_id] : [post.id, post.published_at];
  const [{ rows: prevRows }, { rows: nextRows }] = await Promise.all([
    pool.query(
      `SELECT id, slug, title FROM blog_posts
       WHERE status='published' AND id <> $1 AND (published_at, id) < ($2, $1) ${catClause}
       ORDER BY published_at DESC, id DESC LIMIT 1`,
      params
    ),
    pool.query(
      `SELECT id, slug, title FROM blog_posts
       WHERE status='published' AND id <> $1 AND (published_at, id) > ($2, $1) ${catClause}
       ORDER BY published_at ASC, id ASC LIMIT 1`,
      params
    ),
  ]);
  return { prev: prevRows[0] || null, next: nextRows[0] || null };
}

// ── 글 ────────────────────────────────────────────────────────
const POST_LIST_COLS =
  'p.id, p.slug, p.title, p.summary, p.cover_url, p.category_id, p.status, p.view_count, p.published_at, p.created_at,' +
  ' (p.body_html_en IS NOT NULL) AS has_en';

// 목록(발행글). categoryIds/tagSlug 필터 옵션.
async function listPublished({ limit = 10, offset = 0, categoryIds = null, tagSlug = null } = {}) {
  const where = [`p.status = 'published'`];
  const params = [];
  if (categoryIds && categoryIds.length) {
    params.push(categoryIds);
    where.push(`p.category_id = ANY($${params.length})`);
  }
  let joinTag = '';
  if (tagSlug) {
    params.push(tagSlug);
    joinTag = `JOIN blog_post_tags pt ON pt.post_id = p.id JOIN blog_tags t ON t.id = pt.tag_id AND t.slug = $${params.length}`;
  }
  params.push(limit); const limIdx = params.length;
  params.push(offset); const offIdx = params.length;
  const { rows } = await pool.query(
    `SELECT ${POST_LIST_COLS}, c.slug AS category_slug, c.name AS category_name,
            GREATEST(1, CEIL(char_length(p.body_md) / 500.0))::int AS read_minutes,
            (SELECT COUNT(*) FROM blog_comments cm WHERE cm.post_id = p.id AND cm.is_deleted = false)::int AS comment_count
     FROM blog_posts p ${joinTag}
     LEFT JOIN blog_categories c ON c.id = p.category_id
     WHERE ${where.join(' AND ')}
     ORDER BY p.published_at DESC NULLS LAST, p.id DESC
     LIMIT $${limIdx} OFFSET $${offIdx}`,
    params
  );
  return rows;
}
async function countPublished({ categoryIds = null, tagSlug = null } = {}) {
  const where = [`p.status = 'published'`];
  const params = [];
  if (categoryIds && categoryIds.length) { params.push(categoryIds); where.push(`p.category_id = ANY($${params.length})`); }
  let joinTag = '';
  if (tagSlug) { params.push(tagSlug); joinTag = `JOIN blog_post_tags pt ON pt.post_id=p.id JOIN blog_tags t ON t.id=pt.tag_id AND t.slug=$${params.length}`; }
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM blog_posts p ${joinTag} WHERE ${where.join(' AND ')}`, params
  );
  return rows[0].n;
}

// 관리자: 초안 포함 전체(작성일 최신순, 페이징, 검색/카테고리 필터)
function adminPostFilter({ q = null, categoryId = null } = {}) {
  const where = [];
  const params = [];
  if (q && q.trim()) { params.push(`%${q.trim()}%`); where.push(`p.title ILIKE $${params.length}`); }
  if (categoryId) { params.push(categoryId); where.push(`p.category_id = $${params.length}`); }
  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}
async function listAllAdmin({ limit = 20, offset = 0, q = null, categoryId = null } = {}) {
  const { whereSql, params } = adminPostFilter({ q, categoryId });
  params.push(limit); const limIdx = params.length;
  params.push(offset); const offIdx = params.length;
  const { rows } = await pool.query(
    `SELECT ${POST_LIST_COLS}, c.name AS category_name
     FROM blog_posts p LEFT JOIN blog_categories c ON c.id = p.category_id
     ${whereSql}
     ORDER BY COALESCE(p.published_at, p.created_at) DESC, p.id DESC
     LIMIT $${limIdx} OFFSET $${offIdx}`,
    params
  );
  return rows;
}
async function countAllAdmin({ q = null, categoryId = null } = {}) {
  const { whereSql, params } = adminPostFilter({ q, categoryId });
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM blog_posts p ${whereSql}`, params);
  return rows[0].n;
}

async function getBySlug(slug, { includeUnpublished = false } = {}) {
  const { rows } = await pool.query(
    `SELECT p.*, c.slug AS category_slug, c.name AS category_name
     FROM blog_posts p LEFT JOIN blog_categories c ON c.id = p.category_id
     WHERE p.slug=$1 ${includeUnpublished ? '' : `AND p.status='published'`} LIMIT 1`,
    [slug]
  );
  return rows[0] || null;
}
async function getById(id) {
  const { rows } = await pool.query('SELECT * FROM blog_posts WHERE id=$1', [id]);
  return rows[0] || null;
}

async function slugExists(slug, exceptId = null) {
  const { rows } = await pool.query(
    'SELECT 1 FROM blog_posts WHERE slug=$1 AND ($2::int IS NULL OR id <> $2) LIMIT 1',
    [slug, exceptId]
  );
  return rows.length > 0;
}
// 유니크 slug 확보(충돌 시 -2, -3 …)
async function uniqueSlug(base, exceptId = null) {
  let s = slugify(base);
  let n = 1;
  while (await slugExists(s, exceptId)) { n += 1; s = `${slugify(base)}-${n}`; }
  return s;
}

// 영문 페어(EN) 필드 정규화. body_md_en 이 있으면 body_html_en 렌더 + summary_en 자동보완.
// EN 없으면 전부 null(= /blog/en 미노출). 반환: { title_en, summary_en, body_md_en, body_html_en }
async function normalizeEn(data) {
  const md = data.body_md_en;
  const hasEn = md != null && String(md).trim() !== '';
  if (!hasEn) return { title_en: null, summary_en: null, body_md_en: null, body_html_en: null };
  const title_en = data.title_en && data.title_en.trim() ? data.title_en.trim() : null;
  const summary_en = data.summary_en && data.summary_en.trim() ? data.summary_en.trim() : autoSummary(md);
  return { title_en, summary_en, body_md_en: md, body_html_en: await renderMarkdown(md) };
}

async function createPost(data) {
  const slug = await uniqueSlug(data.slug || data.title || 'post');
  const publish = data.status === 'published';
  const html = await renderMarkdown(data.body_md);
  const summary = data.summary && data.summary.trim() ? data.summary.trim() : autoSummary(data.body_md);
  const en = await normalizeEn(data);
  const publishedAt = data.published_at || (publish ? new Date() : null);
  const seriesOrder = normalizeSeriesOrder(data.series_order);
  const { rows } = await pool.query(
    `INSERT INTO blog_posts (slug, title, summary, body_md, body_html, cover_url, category_id, status, published_at,
                             title_en, summary_en, body_md_en, body_html_en, series_id, series_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING *`,
    [slug, data.title || '(제목 없음)', summary, data.body_md || '', html,
     data.cover_url || null, data.category_id || null, publish ? 'published' : 'draft',
     publishedAt,
     en.title_en, en.summary_en, en.body_md_en, en.body_html_en,
     data.series_id || null, seriesOrder]
  );
  return rows[0];
}

async function updatePost(id, data) {
  const cur = await getById(id);
  if (!cur) return null;
  const slug = data.slug ? await uniqueSlug(data.slug, id) : cur.slug;
  const html = data.body_md != null ? await renderMarkdown(data.body_md) : cur.body_html;
  const bodyMd = data.body_md != null ? data.body_md : cur.body_md;
  const summary = data.summary != null && data.summary.trim()
    ? data.summary.trim()
    : (data.body_md != null ? autoSummary(data.body_md) : cur.summary);
  // EN: body_md_en 이 요청에 있으면(빈 문자열이면 EN 삭제) 재계산, 없으면 기존 유지.
  const en = data.body_md_en != null
    ? await normalizeEn(data)
    : { title_en: cur.title_en, summary_en: cur.summary_en, body_md_en: cur.body_md_en, body_html_en: cur.body_html_en };
  const publishedAt = data.published_at !== undefined ? (data.published_at || null) : cur.published_at;
  const seriesId = data.series_id !== undefined ? (data.series_id || null) : cur.series_id;
  const seriesOrder = data.series_order !== undefined ? normalizeSeriesOrder(data.series_order) : cur.series_order;
  const { rows } = await pool.query(
    `UPDATE blog_posts SET
       slug=$2, title=COALESCE($3,title), summary=$4, body_md=$5, body_html=$6,
       cover_url=$7, category_id=$8, updated_at=NOW(), published_at=$13,
       title_en=$9, summary_en=$10, body_md_en=$11, body_html_en=$12,
       series_id=$14, series_order=$15
     WHERE id=$1 RETURNING *`,
    [id, slug, data.title ?? null, summary, bodyMd, html,
     data.cover_url ?? cur.cover_url, data.category_id ?? cur.category_id,
     en.title_en, en.summary_en, en.body_md_en, en.body_html_en, publishedAt,
     seriesId, seriesOrder]
  );
  return rows[0];
}

// 발행 상태 토글. publish=true 면 published_at 첫 발행 시 지정.
async function setStatus(id, publish) {
  const { rows } = await pool.query(
    `UPDATE blog_posts SET
       status = $2,
       published_at = CASE WHEN $3 AND published_at IS NULL THEN NOW() ELSE published_at END,
       updated_at = NOW()
     WHERE id=$1 RETURNING *`,
    [id, publish ? 'published' : 'draft', !!publish]
  );
  return rows[0] || null;
}

async function removePost(id) {
  const { rowCount } = await pool.query('DELETE FROM blog_posts WHERE id=$1', [id]);
  return rowCount > 0;
}
async function incrementView(id) {
  await pool.query('UPDATE blog_posts SET view_count = view_count + 1 WHERE id=$1', [id]);
}

// ── 사용자(OAuth) ─────────────────────────────────────────────
async function upsertOAuthUser({ provider, provider_uid, display_name, avatar_url, is_op }) {
  const { rows } = await pool.query(
    `INSERT INTO blog_users (provider, provider_uid, display_name, avatar_url, is_op)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (provider, provider_uid) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       avatar_url   = EXCLUDED.avatar_url,
       is_op        = blog_users.is_op OR EXCLUDED.is_op
     RETURNING *`,
    [provider, String(provider_uid), display_name || 'user', avatar_url || null, !!is_op]
  );
  return rows[0];
}
async function getUser(id) {
  const { rows } = await pool.query('SELECT * FROM blog_users WHERE id=$1', [id]);
  return rows[0] || null;
}
// 사이트 주인(=글 author). 운영자(is_op) 계정 중 대표를 고른다.
// BLOG_OWNER_GOOGLE 로 지정한 주 계정(google) 우선, 없으면 github, 그다음 최초 등록.
async function getOwner() {
  const { rows } = await pool.query(
    `SELECT id, display_name, avatar_url FROM blog_users WHERE is_op=true
     ORDER BY (provider='google') DESC, id ASC LIMIT 1`
  );
  return rows[0] || null;
}
async function listUsers() {
  const { rows } = await pool.query(
    `SELECT u.id, u.provider, u.display_name, u.avatar_url, u.is_op, u.created_at,
            COUNT(cm.id)::int AS comment_count
     FROM blog_users u LEFT JOIN blog_comments cm ON cm.user_id = u.id
     GROUP BY u.id ORDER BY u.created_at DESC`
  );
  return rows;
}
async function setUserOp(id, isOp) {
  const { rows } = await pool.query(
    'UPDATE blog_users SET is_op=$2 WHERE id=$1 RETURNING id, is_op', [id, !!isOp]
  );
  return rows[0] || null;
}

// ── 댓글(스레드) ──────────────────────────────────────────────
async function listCommentTree(postId) {
  const { rows } = await pool.query(
    `SELECT cm.id, cm.parent_id, cm.body, cm.is_deleted, cm.created_at, cm.user_id,
            u.display_name, u.avatar_url, u.is_op
     FROM blog_comments cm JOIN blog_users u ON u.id = cm.user_id
     WHERE cm.post_id=$1 ORDER BY cm.created_at ASC`,
    [postId]
  );
  // flat → tree
  const byId = new Map();
  const roots = [];
  for (const r of rows) {
    r.children = [];
    r.body = r.is_deleted ? null : r.body;   // 삭제된 댓글은 본문 마스킹(스레드 골격은 유지)
    byId.set(r.id, r);
  }
  for (const r of rows) {
    if (r.parent_id && byId.has(r.parent_id)) byId.get(r.parent_id).children.push(r);
    else roots.push(r);
  }
  return roots;
}
async function commentCount(postId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM blog_comments WHERE post_id=$1 AND is_deleted=false`, [postId]
  );
  return rows[0].n;
}
async function createComment({ post_id, parent_id, user_id, body }) {
  const { rows } = await pool.query(
    `INSERT INTO blog_comments (post_id, parent_id, user_id, body)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [post_id, parent_id || null, user_id, body]
  );
  return rows[0];
}
async function getComment(id) {
  const { rows } = await pool.query('SELECT * FROM blog_comments WHERE id=$1', [id]);
  return rows[0] || null;
}
async function hasChildComments(id) {
  const { rows } = await pool.query('SELECT 1 FROM blog_comments WHERE parent_id=$1 LIMIT 1', [id]);
  return rows.length > 0;
}
// 자식 있으면 soft delete, 없으면 hard delete
async function deleteComment(id) {
  if (await hasChildComments(id)) {
    await pool.query(`UPDATE blog_comments SET is_deleted=true, body='' WHERE id=$1`, [id]);
    return 'soft';
  }
  await pool.query('DELETE FROM blog_comments WHERE id=$1', [id]);
  return 'hard';
}

// ── 이미지 라이브러리 ─────────────────────────────────────────
async function createImage({ post_id, url, filepath, filename, bytes }) {
  const { rows } = await pool.query(
    `INSERT INTO blog_images (post_id, url, filepath, filename, bytes)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [post_id || null, url, filepath, filename || null, bytes || null]
  );
  return rows[0];
}
// 특정 포스트에 귀속된 이미지 + 아직 미귀속(post_id NULL) 임시 업로드까지 라이브러리에 노출
async function imagesForPost(postId) {
  const { rows } = await pool.query(
    `SELECT id, post_id, url, filename, bytes, created_at FROM blog_images
     WHERE post_id=$1 OR post_id IS NULL ORDER BY created_at DESC`,
    [postId]
  );
  return rows;
}
// 정확히 이 포스트에만 귀속된 이미지(미귀속 제외) — 에디터 기본 스코프
async function imagesForPostStrict(postId) {
  const { rows } = await pool.query(
    `SELECT id, post_id, url, filename, bytes, created_at FROM blog_images
     WHERE post_id=$1 ORDER BY created_at DESC`,
    [postId]
  );
  return rows;
}
// 전체 이미지(모든 글 + 미귀속) — "전체 이미지 소스" 조회용
async function allImages() {
  const { rows } = await pool.query(
    `SELECT id, post_id, url, filename, bytes, created_at FROM blog_images ORDER BY created_at DESC`
  );
  return rows;
}
// 어떤 글의 body_md/cover_url 에도 등장하지 않는 이미지(= 미사용)
async function unusedImages() {
  const { rows } = await pool.query(
    `SELECT i.id, i.url, i.filepath FROM blog_images i
     WHERE NOT EXISTS (
       SELECT 1 FROM blog_posts p
       WHERE position(i.url IN p.body_md) > 0 OR p.cover_url = i.url
     )`
  );
  return rows;
}
async function deleteImageRows(ids) {
  if (!ids || !ids.length) return 0;
  const { rowCount } = await pool.query('DELETE FROM blog_images WHERE id = ANY($1)', [ids]);
  return rowCount;
}

// ── 반응(claps) ──────────────────────────────────────────────
async function getClaps(postId) {
  const { rows } = await pool.query(
    'SELECT COALESCE(SUM(count),0)::int AS n FROM blog_claps WHERE post_id=$1', [postId]
  );
  return rows[0].n;
}
async function addClap(postId, n = 1) {
  const inc = Math.max(1, Math.min(10, Number(n) || 1));
  const { rows } = await pool.query(
    `INSERT INTO blog_claps (post_id, day, count) VALUES ($1, CURRENT_DATE, $2)
     ON CONFLICT (post_id, day) DO UPDATE SET count = blog_claps.count + $2
     RETURNING (SELECT COALESCE(SUM(count),0)::int FROM blog_claps WHERE post_id=$1) AS total`,
    [postId, inc]
  );
  return rows[0].total;
}

module.exports = {
  pool, ensureSchema, renderMarkdown, slugify,
  // categories
  categoryTree, resolveCategoryPath, descendantIds, categoryPath,
  createCategory, updateCategory, removeCategory,
  // tags
  listTags, ensureTags, setPostTags, tagsForPost, getTagBySlug,
  // series
  listSeries, getSeriesById, createSeries, updateSeries, removeSeries, seriesItems,
  renderSeriesBlock, expandSeriesMount, adjacentPosts,
  // posts
  listPublished, countPublished, listAllAdmin, countAllAdmin, getBySlug, getById,
  createPost, updatePost, setStatus, removePost, incrementView, uniqueSlug,
  // users
  upsertOAuthUser, getUser, getOwner, listUsers, setUserOp,
  // comments
  listCommentTree, commentCount, createComment, getComment, deleteComment,
  // images
  createImage, imagesForPost, imagesForPostStrict, allImages, unusedImages, deleteImageRows,
  // claps
  getClaps, addClap,
};
