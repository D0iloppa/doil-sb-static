// 관리자 콘솔 설정 API — 토큰 보호.
const express = require('express');
const { requireToken } = require('../../auth');
const settings = require('../../db/appSettings');

const router = express.Router();

router.get('/', requireToken, async (req, res) => {
  try {
    res.json(await settings.getAll());
  } catch (e) {
    console.error('[settings] get error:', e.message);
    res.status(502).json({ error: 'db error' });
  }
});

router.put('/', requireToken, async (req, res) => {
  const { key, value } = req.body || {};
  if (typeof key !== 'string' || !key.trim()) return res.status(400).json({ error: 'key required' });
  try {
    await settings.set(key, value == null ? null : String(value));
    res.json({ key, value });
  } catch (e) {
    console.error('[settings] put error:', e.message);
    res.status(502).json({ error: 'db error' });
  }
});

module.exports = router;
