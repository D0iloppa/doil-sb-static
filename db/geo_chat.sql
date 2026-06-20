-- geo 챗봇 작업 큐 — doil-sb(BFF)가 적재, host agent(agent/geochat)가 폴링·처리.
-- 공유 dev DB(컨테이너 db / 별칭 devdb)에 둔다. doil-sb 부팅 시 geoChat.js 가 IF NOT EXISTS 로 보장.
--
-- 흐름: 사용자 채팅 → doil-sb 가 row INSERT(status=queued)
--      → host agent 가 queued 픽업 → status=processing → claude -p 로 supplement 생성
--      → 배포 등 위험행동 직전 status=needs_confirm(reply 에 설명) → 사용자 confirm
--      → status=confirmed(confirmed_at) → 에이전트가 page_deploy → status=done(result 에 산출물) / 실패 시 error.

CREATE TABLE IF NOT EXISTS geo_chat_jobs (
  id           BIGSERIAL PRIMARY KEY,
  session_id   TEXT,                            -- 멀티턴 대화 묶음(프론트가 발급)
  message      TEXT NOT NULL,                   -- 사용자 요청 원문
  status       TEXT NOT NULL DEFAULT 'queued',  -- queued→processing→needs_confirm→confirmed→done/error
  reply        TEXT,                            -- 사용자에게 보여줄 에이전트 응답
  result       JSONB,                           -- 산출물 {ccn3, iso_a2, supplement, deployed, ...}
  error        TEXT,                            -- 실패 사유(status=error)
  confirmed_at TIMESTAMPTZ,                     -- 위험행동 사용자 승인 시각(needs_confirm 해제)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_geo_chat_jobs_status ON geo_chat_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_geo_chat_jobs_session ON geo_chat_jobs(session_id, created_at);
