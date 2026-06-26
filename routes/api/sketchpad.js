const express = require('express');
const { randomUUID } = require('crypto');
const { Client } = require('@notionhq/client');
const db = require('../../db/sketchpad');

const router = express.Router();

// POST /api/sketchpad/notion-hook — Notion 버튼 웹훅: UUID 캔버스 생성 후 해당 페이지에 embed 블록 삽입
router.post('/notion-hook', async (req, res) => {
  console.log('[sketchpad/notion-hook] payload:', JSON.stringify(req.body));

  // Notion webhook payload에서 page_id 추출 (위치는 버전마다 다를 수 있어 fallback 포함)
  const pageId = req.body?.data?.id || req.body?.data?.page_id || req.body?.source?.page_id;

  if (!pageId) {
    console.error('[sketchpad/notion-hook] page_id not found in payload');
    return res.status(400).json({ error: 'page_id not found' });
  }

  if (!process.env.NOTION_TOKEN) return res.status(500).json({ error: 'NOTION_TOKEN not set' });

  const notion = new Client({ auth: process.env.NOTION_TOKEN });
  const uuid = randomUUID();
  const sketchpadUrl = `https://doil.me/sb/sketchpad/${uuid}`;

  try {
    await notion.blocks.children.append({
      block_id: pageId,
      children: [{ object: 'block', type: 'embed', embed: { url: sketchpadUrl } }],
    });
    res.json({ ok: true, url: sketchpadUrl });
  } catch (e) {
    console.error('[sketchpad/notion-hook] notion API error:', e.message);
    res.status(502).json({ error: e.message });
  }
});

// GET /api/sketchpad/:id — 캔버스 데이터 조회
router.get('/:id', async (req, res) => {
  try {
    const row = await db.get(req.params.id);
    if (!row) return res.status(404).json({ error: 'not found' });
    res.json(row);
  } catch (e) {
    console.error('[sketchpad] get error:', e.message);
    res.status(500).json({ error: 'db error' });
  }
});

// PUT /api/sketchpad/:id — 캔버스 데이터 저장 (upsert)
router.put('/:id', async (req, res) => {
  const { elements, app_state } = req.body;
  if (!Array.isArray(elements)) {
    return res.status(400).json({ error: 'elements must be array' });
  }
  try {
    const row = await db.upsert(req.params.id, elements, app_state || {});
    res.json(row);
  } catch (e) {
    console.error('[sketchpad] put error:', e.message);
    res.status(500).json({ error: 'db error' });
  }
});

module.exports = router;
