// doil.me 블로그 CMS MCP 도구 — doil-sb 의 /api/blog/admin/* 를 HTTP 로 호출(DB 직접 접근 없음).
// 검증·slug·마크다운 렌더·정화는 전부 doil-sb 한 곳에서 유지되고, 여기는 얇은 래퍼일 뿐이다.
// 인증: BLOG_SERVICE_TOKEN(정적 서비스 토큰). doil-sb 의 requireBlogAdmin 이 이 토큰을 블로그 admin 경로에서만 허용.
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const configPath = path.join(__dirname, '..', 'config.yml');
const config = fs.existsSync(configPath) ? yaml.load(fs.readFileSync(configPath, 'utf8')) : {};

const BLOG_BASE = (config.blog?.base || process.env.BLOG_BASE || 'https://doil.me').replace(/\/$/, '');
const SERVICE_TOKEN = config.blog?.service_token || process.env.BLOG_SERVICE_TOKEN || '';

async function blogFetch(apiPath, options = {}) {
  if (!SERVICE_TOKEN) throw new Error('BLOG_SERVICE_TOKEN 미설정 (config.yml blog.service_token)');
  const res = await fetch(`${BLOG_BASE}/api/blog${apiPath}`, {
    ...options,
    headers: { Authorization: `Bearer ${SERVICE_TOKEN}`, ...options.headers },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`blog API ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}
async function blogJson(apiPath, method, body) {
  return blogFetch(apiPath, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body != null ? JSON.stringify(body) : undefined,
  });
}
const out = (obj) => JSON.stringify(obj, null, 2);

const tools = [
  {
    name: 'blog_list_posts',
    description: 'doil.me 블로그 글 목록(초안 포함) 조회. 제목/slug/상태/카테고리/조회수 요약을 반환.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    handler: async () => out((await blogFetch('/admin/posts')).posts || []),
  },
  {
    name: 'blog_get_post',
    description: '블로그 글 1건 상세(원본 body_md·요약·커버·카테고리·태그 포함) 조회.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number', description: '글 id' } },
      required: ['id'],
    },
    handler: async ({ id }) => out(await blogFetch(`/admin/posts/${id}`)),
  },
  {
    name: 'blog_create_post',
    description: '블로그 글 생성. 마크다운(body_md)은 서버에서 정화·렌더된다. status="published" 면 즉시 발행.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '제목' },
        body_md: { type: 'string', description: '본문 마크다운' },
        summary: { type: 'string', description: '요약(비우면 본문 앞부분 자동)' },
        slug: { type: 'string', description: 'URL slug(비우면 제목 기반 자동)' },
        category_id: { type: 'number', description: '카테고리 id(선택)' },
        tags: { type: 'array', items: { type: 'string' }, description: '태그 이름 배열(선택)' },
        cover_url: { type: 'string', description: '커버 이미지 URL(선택)' },
        status: { type: 'string', enum: ['draft', 'published'], description: '기본 draft' },
        title_en: { type: 'string', description: '영문 제목(EN 페어, 선택)' },
        summary_en: { type: 'string', description: '영문 요약(비우면 EN 본문 앞부분 자동)' },
        body_md_en: { type: 'string', description: '영문 본문 마크다운 — 있으면 /blog/en/:slug 영문 페어 생성' },
      },
      required: ['title', 'body_md'],
    },
    handler: async (a) => out(await blogJson('/admin/posts', 'POST', a)),
  },
  {
    name: 'blog_update_post',
    description: '블로그 글 수정. 넘긴 필드만 갱신. body_md 변경 시 서버가 다시 정화·렌더한다.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: '글 id' },
        title: { type: 'string' },
        body_md: { type: 'string' },
        summary: { type: 'string' },
        slug: { type: 'string' },
        category_id: { type: 'number' },
        tags: { type: 'array', items: { type: 'string' } },
        cover_url: { type: 'string' },
        title_en: { type: 'string', description: '영문 제목(EN 페어)' },
        summary_en: { type: 'string', description: '영문 요약' },
        body_md_en: { type: 'string', description: '영문 본문 마크다운(빈 문자열이면 EN 페어 제거)' },
      },
      required: ['id'],
    },
    handler: async ({ id, ...a }) => out(await blogJson(`/admin/posts/${id}`, 'PUT', a)),
  },
  {
    name: 'blog_delete_post',
    description: '블로그 글 삭제(영구).',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number', description: '글 id' } },
      required: ['id'],
    },
    handler: async ({ id }) => out(await blogJson(`/admin/posts/${id}`, 'DELETE')),
  },
  {
    name: 'blog_publish',
    description: '블로그 글 발행/초안 전환. publish=false 면 초안으로 내림.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: '글 id' },
        publish: { type: 'boolean', description: '기본 true(발행). false 면 초안으로.' },
      },
      required: ['id'],
    },
    handler: async ({ id, publish = true }) => out(await blogJson(`/admin/posts/${id}/publish`, 'POST', { publish })),
  },
  {
    name: 'blog_upload_image',
    description: '블로그 이미지 업로드 → /cdn/blog 저장(imgproxy 최적화 서빙). 로컬 파일 경로(path) 또는 base64(data+mime) 중 하나. 반환된 url 을 본문 마크다운에 ![](url) 로 삽입한다.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '업로드할 로컬 이미지 파일 경로' },
        data: { type: 'string', description: 'base64 이미지 데이터(path 대신)' },
        mime: { type: 'string', description: "base64 사용 시 MIME (예: 'image/png')" },
        filename: { type: 'string', description: '파일명(선택)' },
        post_id: { type: 'number', description: '귀속 글 id(선택, 없으면 미귀속 임시 업로드)' },
      },
      required: [],
    },
    handler: async ({ path: filePath, data, mime, filename, post_id }) => {
      let buf, fname, type;
      if (filePath) {
        buf = fs.readFileSync(filePath);
        fname = filename || path.basename(filePath);
        type = mime || { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif' }[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      } else if (data) {
        buf = Buffer.from(data, 'base64');
        fname = filename || 'upload';
        type = mime || 'image/png';
      } else {
        throw new Error('path 또는 data(base64) 중 하나는 필수');
      }
      const fd = new FormData();
      fd.append('file', new Blob([buf], { type }), fname);
      if (post_id) fd.append('post_id', String(post_id));
      return out(await blogFetch('/admin/images', { method: 'POST', body: fd }));
    },
  },
  {
    name: 'blog_list_images',
    description: '특정 글의 이미지 라이브러리(미귀속 임시 업로드 포함) 조회.',
    inputSchema: {
      type: 'object',
      properties: { post_id: { type: 'number', description: '글 id' } },
      required: ['post_id'],
    },
    handler: async ({ post_id }) => out((await blogFetch(`/admin/posts/${post_id}/images`)).images || []),
  },
  {
    name: 'blog_trash_unused',
    description: '어떤 글에도 쓰이지 않은 업로드 이미지를 휴지통(.trash)으로 이동(안전 삭제, 복구 가능).',
    inputSchema: { type: 'object', properties: {}, required: [] },
    handler: async () => out(await blogJson('/admin/images/trash-unused', 'POST')),
  },
];

module.exports = { tools };
