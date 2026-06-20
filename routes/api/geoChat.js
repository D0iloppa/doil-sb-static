// geo 챗봇 백엔드 — 작업 큐 적재/조회. 로그인/토큰은 공유 auth(../../auth) 사용.
// 공개 페이지(doil.me/geo)에서 호출하므로 토큰 필수(로그인은 POST /api/auth/login).
// 실제 보강·배포(claude CLI, geo-prepare, page_deploy)는 host agent 가 큐를 픽업해 수행한다.
const express = require('express');
const { requireToken } = require('../../auth');
const { createJob, getJob, confirmJob } = require('../../db/geoChat');

const router = express.Router();

// ---- POST / : 채팅 메시지 → 작업 큐 적재 ----
router.post('/', requireToken, async (req, res) => {
  const { message, sessionId } = req.body || {};
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message required' });
  }
  if (message.length > 2000) {
    return res.status(400).json({ error: 'message too long', message: '2000자 이내로 입력하세요.' });
  }
  try {
    const job = await createJob(sessionId, message.trim());
    res.status(202).json({ jobId: job.id, sessionId: job.session_id, status: job.status });
  } catch (err) {
    console.error('[geo-chat] createJob error:', err.message);
    res.status(502).json({ error: 'queue error' });
  }
});

// ---- GET /jobs/:id : 작업 상태/응답 폴링 ----
router.get('/jobs/:id', requireToken, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'invalid id' });
  }
  try {
    const job = await getJob(id);
    if (!job) return res.status(404).json({ error: 'not found' });
    res.json({
      jobId: job.id,
      sessionId: job.session_id,
      status: job.status,
      reply: job.reply,
      result: job.result,
      error: job.error,
      confirmedAt: job.confirmed_at,
    });
  } catch (err) {
    console.error('[geo-chat] getJob error:', err.message);
    res.status(502).json({ error: 'queue error' });
  }
});

// ---- POST /jobs/:id/confirm : 위험행동(배포) 사용자 승인 ----
router.post('/jobs/:id/confirm', requireToken, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'invalid id' });
  }
  try {
    const job = await confirmJob(id);
    if (!job) return res.status(409).json({ error: 'not confirmable', message: '승인 대기(needs_confirm) 상태가 아닙니다.' });
    res.json({ jobId: job.id, status: job.status, confirmedAt: job.confirmed_at });
  } catch (err) {
    console.error('[geo-chat] confirmJob error:', err.message);
    res.status(502).json({ error: 'queue error' });
  }
});

module.exports = router;
