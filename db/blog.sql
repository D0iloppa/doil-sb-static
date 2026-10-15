-- 블로그 CMS 스키마 — 공유 dev DB. 프리픽스 blog_. idempotent (매 부팅 ensureSchema 실행).
-- 기획: ai-docs/blog-cms-plan.md

-- ── 카테고리 (계층형: adjacency list) ─────────────────────────
CREATE TABLE IF NOT EXISTS blog_categories (
  id          SERIAL PRIMARY KEY,
  parent_id   INTEGER REFERENCES blog_categories(id) ON DELETE CASCADE,
  slug        VARCHAR(80)  NOT NULL,
  name        VARCHAR(120) NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- 같은 부모 아래 slug 유일. 최상위(parent NULL)는 부분 유니크 인덱스로 처리.
CREATE UNIQUE INDEX IF NOT EXISTS uq_blog_cat_parent_slug
  ON blog_categories(parent_id, slug) WHERE parent_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_blog_cat_root_slug
  ON blog_categories(slug) WHERE parent_id IS NULL;

-- ── 사용자 (소셜 로그인) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS blog_users (
  id           SERIAL PRIMARY KEY,
  provider     VARCHAR(20)  NOT NULL,      -- 'github' | 'google'
  provider_uid VARCHAR(120) NOT NULL,
  display_name VARCHAR(80)  NOT NULL,
  avatar_url   VARCHAR(1000),
  is_op        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_uid)
);

-- ── 글 ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blog_posts (
  id            SERIAL PRIMARY KEY,
  slug          VARCHAR(200) NOT NULL UNIQUE,
  title         VARCHAR(300) NOT NULL,
  summary       TEXT,
  body_md       TEXT NOT NULL,
  body_html     TEXT NOT NULL,
  cover_url     VARCHAR(1000),
  category_id   INTEGER REFERENCES blog_categories(id) ON DELETE SET NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'draft',   -- 'draft' | 'published'
  view_count    INTEGER NOT NULL DEFAULT 0,
  published_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_blog_posts_pub ON blog_posts(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_posts_cat ON blog_posts(category_id);

-- ── 태그 (다대다) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blog_tags (
  id    SERIAL PRIMARY KEY,
  slug  VARCHAR(80) NOT NULL UNIQUE,
  name  VARCHAR(80) NOT NULL
);
CREATE TABLE IF NOT EXISTS blog_post_tags (
  post_id INTEGER NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES blog_tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

-- ── 댓글 (중첩 스레드, 토론형) ────────────────────────────────
CREATE TABLE IF NOT EXISTS blog_comments (
  id           SERIAL PRIMARY KEY,
  post_id      INTEGER NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  parent_id    INTEGER REFERENCES blog_comments(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES blog_users(id) ON DELETE CASCADE,
  body         TEXT NOT NULL,
  is_deleted   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_blog_comments_post   ON blog_comments(post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_blog_comments_parent ON blog_comments(parent_id);

-- ── 반응 (claps, 익명·일자 파티션) ───────────────────────────
CREATE TABLE IF NOT EXISTS blog_claps (
  post_id  INTEGER NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  day      DATE    NOT NULL DEFAULT CURRENT_DATE,
  count    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (post_id, day)
);

-- ── 이미지 라이브러리 (업로드 → /cdn/blog, imgproxy 최적화 서빙) ──────
CREATE TABLE IF NOT EXISTS blog_images (
  id         SERIAL PRIMARY KEY,
  post_id    INTEGER REFERENCES blog_posts(id) ON DELETE SET NULL,  -- 임시 업로드는 NULL
  url        VARCHAR(1000) NOT NULL,   -- /cdn/blog/<postId>/<uuid>.<ext>
  filepath   VARCHAR(1000) NOT NULL,   -- 컨테이너 내 실제 경로(mv/rm 용)
  filename   VARCHAR(300),
  bytes      INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_blog_images_post ON blog_images(post_id);

-- ── i18n: 영문 페어(EN 변형) — 1 논리 포스트 = 한/영 쌍. EN 은 nullable(있을 때만 /blog/en/:slug 노출) ──
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS title_en     VARCHAR(300);
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS summary_en   TEXT;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS body_md_en   TEXT;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS body_html_en TEXT;

-- ── 시리즈 (연재물 — 카테고리와 별개, 글에 옵셔널로 부여) ──────────
-- series_order 는 '1-2-3'처럼 '-'로 depth 구분한 트리 순서 문자열(정수 세그먼트만 허용).
CREATE TABLE IF NOT EXISTS blog_series (
  id         SERIAL PRIMARY KEY,
  slug       VARCHAR(120) NOT NULL UNIQUE,
  name       VARCHAR(200) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS series_id    INTEGER REFERENCES blog_series(id) ON DELETE SET NULL;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS series_order VARCHAR(50);
CREATE INDEX IF NOT EXISTS idx_blog_posts_series ON blog_posts(series_id);
-- 챕터 라벨: 실제 글이 없는 중간 경로(예: "1")에도 이름을 붙일 수 있게. { "1": "아스라이", "2-1": "..." } 형태.
ALTER TABLE blog_series ADD COLUMN IF NOT EXISTS chapter_labels JSONB NOT NULL DEFAULT '{}'::jsonb;
