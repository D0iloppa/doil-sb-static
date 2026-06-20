// 홈페이지 서비스 일람 API — 공개 읽기 + 토큰 보호 CRUD(관리자 콘솔).
const express = require('express');
const { requireToken } = require('../../auth');
const svc = require('../../db/siteServices');

const router = express.Router();

// 공개: 홈페이지가 로딩. { projects:[...], social:[...] }
router.get('/', async (req, res) => {
  try {
    const rows = await svc.listVisible();
    res.json({
      projects: rows.filter(r => r.type === 'project'),
      social: rows.filter(r => r.type === 'social'),
    });
  } catch (err) {
    console.error('[services] list error:', err.message);
    res.status(502).json({ error: 'db error' });
  }
});

// 관리자: 숨김 포함 전체
router.get('/all', requireToken, async (req, res) => {
  try {
    res.json({ items: await svc.listAll() });
  } catch (err) {
    console.error('[services] listAll error:', err.message);
    res.status(502).json({ error: 'db error' });
  }
});

function validate(body) {
  if (!body || typeof body.href !== 'string' || !body.href.trim()) return 'href required';
  if (typeof body.icon !== 'string' || !body.icon.trim()) return 'icon required';
  if (body.type && !['project', 'social'].includes(body.type)) return 'invalid type';
  return null;
}

router.post('/', requireToken, async (req, res) => {
  const err = validate(req.body);
  if (err) return res.status(400).json({ error: err });
  try {
    res.status(201).json(await svc.create(req.body));
  } catch (e) {
    console.error('[services] create error:', e.message);
    res.status(502).json({ error: 'db error' });
  }
});

router.put('/:id', requireToken, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid id' });
  try {
    const row = await svc.update(id, req.body || {});
    if (!row) return res.status(404).json({ error: 'not found' });
    res.json(row);
  } catch (e) {
    console.error('[services] update error:', e.message);
    res.status(502).json({ error: 'db error' });
  }
});

router.delete('/:id', requireToken, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid id' });
  try {
    const ok = await svc.remove(id);
    if (!ok) return res.status(404).json({ error: 'not found' });
    res.json({ deleted: id });
  } catch (e) {
    console.error('[services] delete error:', e.message);
    res.status(502).json({ error: 'db error' });
  }
});

module.exports = router;
