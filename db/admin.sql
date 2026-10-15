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

-- 로그인 토큰 — DB 에 백업해두면 doil-sb 재기동 후에도 세션 유지(부팅 시 hydrate).
-- 활동 갱신(touch)은 DB 에 쓰지 않음(TTL 이 100년이라 슬라이딩 정밀도가 의미 없고, 잦은 호출 부하만 늘어남).
CREATE TABLE IF NOT EXISTS admin_tokens (
  token      TEXT PRIMARY KEY,
  username   TEXT NOT NULL,
  role       TEXT NOT NULL,
  exp        BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
