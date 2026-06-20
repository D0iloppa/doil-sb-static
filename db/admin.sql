-- 관리자 자격증명 — 하드코딩 env 대신 DB 저장(암호/아이디 변경 시 무재기동).
-- pw_hash 는 scrypt 해시 문자열: "scrypt$<saltHex>$<hashHex>". 평문 저장 안 함.
CREATE TABLE IF NOT EXISTS admin_users (
  id         BIGSERIAL PRIMARY KEY,
  username   TEXT UNIQUE NOT NULL,
  pw_hash    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'sub';  -- 'root' | 'sub' (패널 접근 권한)
