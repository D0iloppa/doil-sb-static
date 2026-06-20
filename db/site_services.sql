-- 홈페이지(doil-react) 서비스 일람 — 기존 src/data/projects.jsx 의 PROJECTS/SOCIAL_LINKS 이관.
-- 공유 dev DB. doil-sb 부팅 시 services.js 가 IF NOT EXISTS 로 테이블 보장(시드는 1회 수동).
-- icon: 이모지 문자열 또는 컴포넌트 키('SiNotion' 등) — 프론트가 키→아이콘 레지스트리로 매핑.

CREATE TABLE IF NOT EXISTS site_services (
  id           BIGSERIAL PRIMARY KEY,
  type         TEXT NOT NULL DEFAULT 'project',  -- 'project'(서비스 카드) | 'social'(소셜 링크)
  title        TEXT,                             -- project 표시명
  description  TEXT,                             -- project 설명
  href         TEXT NOT NULL,
  icon         TEXT NOT NULL,                    -- 이모지 또는 컴포넌트 키
  badge        TEXT,                             -- 'public' | 'private'
  badge_label  TEXT,                             -- 'Public' | 'Internal' | 'deprecated'
  label        TEXT,                             -- social 링크 라벨('GITHUB' 등)
  sort_order   INTEGER NOT NULL DEFAULT 0,
  visible      BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_site_services_type_order ON site_services(type, visible, sort_order);
