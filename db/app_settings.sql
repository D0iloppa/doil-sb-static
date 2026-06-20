-- 관리자 콘솔 설정 키/값 (배경 프리셋 등). 공유 dev DB. doil-sb 부팅 시 IF NOT EXISTS 보장.
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
