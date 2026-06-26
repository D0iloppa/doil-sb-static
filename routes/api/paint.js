const express = require('express');
const fs = require('fs');
const path = require('path');
const { requireToken } = require('../../auth');

const router = express.Router();
const SHARED_DIR = process.env.DOBIS_SHARED_DIR || '/app/dobis-shared';

// POST /api/paint/save — base64 PNG → dobis/shared/paint_*.png
router.post('/save', requireToken, (req, res) => {
  const { dataUrl, filename } = req.body;
  if (!dataUrl || !dataUrl.startsWith('data:image/png;base64,')) {
    return res.status(400).json({ error: 'dataUrl must be a PNG data URL' });
  }
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  const safe = (filename || '').replace(/[^a-z0-9_\-]/gi, '').slice(0, 40) || 'untitled';
  const ts = Date.now();
  const fname = `paint_${safe}_${ts}.png`;
  const dest = path.join(SHARED_DIR, fname);
  try {
    fs.mkdirSync(SHARED_DIR, { recursive: true });
    fs.writeFileSync(dest, Buffer.from(base64, 'base64'));
    res.json({ ok: true, filename: fname });
  } catch (e) {
    console.error('[paint] save error:', e.message);
    res.status(500).json({ error: 'save failed' });
  }
});

// GET /api/paint/list — 저장된 그림 목록 (최신순 50개)
router.get('/list', requireToken, (req, res) => {
  try {
    if (!fs.existsSync(SHARED_DIR)) return res.json({ files: [] });
    const files = fs.readdirSync(SHARED_DIR)
      .filter(f => f.startsWith('paint_') && f.endsWith('.png'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(SHARED_DIR, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 50)
      .map(f => f.name);
    res.json({ files });
  } catch (e) {
    res.status(500).json({ error: 'list failed' });
  }
});

module.exports = router;
