const express = require('express');
const { Client } = require('@notionhq/client');
const { runScanAsync } = require('../graph');

const router = express.Router();

// POST /api/graph/notion-hook
// Notion 버튼 블록 웹훅: 현재 페이지 ID → graph embed 블록 삽입
router.post('/notion-hook', async (req, res) => {
  console.log('[graph/notion-hook] payload:', JSON.stringify(req.body));

  // sketchpad 훅과 동일한 pageId 추출 패턴
  const pageId = req.body?.data?.id
    || req.body?.data?.page_id
    || req.body?.source?.page_id;

  if (!pageId) {
    console.error('[graph/notion-hook] page_id not found in payload');
    return res.status(400).json({ error: 'page_id not found' });
  }

  if (!process.env.NOTION_TOKEN) {
    return res.status(500).json({ error: 'NOTION_TOKEN not set' });
  }

  const notion = new Client({ auth: process.env.NOTION_TOKEN });
  const cleanId = pageId.replace(/-/g, '');
  const graphUrl = `https://doil.me/sb/graph/${cleanId}`;

  try {
    await notion.blocks.children.append({
      block_id: pageId,
      children: [{ object: 'block', type: 'embed', embed: { url: graphUrl } }],
    });
    console.log(`[graph/notion-hook] embed 삽입 완료: page=${pageId} url=${graphUrl}`);
    res.json({ ok: true, url: graphUrl });
    runScanAsync(cleanId); // 백그라운드 서브스캔 — embed 응답과 무관하게 DB 갱신
  } catch (e) {
    console.error('[graph/notion-hook] Notion API 오류:', e.message);
    res.status(502).json({ error: e.message });
  }
});

module.exports = router;
