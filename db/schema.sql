-- 게임 플랫폼 스키마 (기존 dev DB, public schema)
-- 적용: docker exec -i db psql -U doil -d dev < doil-sb/db/schema.sql
-- 멱등(IF NOT EXISTS)이라 반복 적용 안전.

-- 플레이어 영속 정보. level 대신 iq 스탯을 누적한다.
CREATE TABLE IF NOT EXISTS game_player (
  player_id    TEXT PRIMARY KEY,                 -- 클라이언트 localStorage playerId
  nickname     TEXT NOT NULL,
  iq           INTEGER NOT NULL DEFAULT 100,     -- 레벨 대체 스탯
  games_played INTEGER NOT NULL DEFAULT 0,
  wins         INTEGER NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- OX 서바이벌 퀴즈 콘텐츠.
CREATE TABLE IF NOT EXISTS quiz_question (
  id         SERIAL PRIMARY KEY,
  category   TEXT,
  question   TEXT NOT NULL UNIQUE,               -- UNIQUE → 시드 재적용 시 중복 방지
  answer     BOOLEAN NOT NULL,                   -- true = O, false = X
  difficulty SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
