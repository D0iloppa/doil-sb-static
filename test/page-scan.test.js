'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createPageScanner } = require('../lib/page-scan');

// 분리 전 routes/graph.js 의 scanPageContent 원본(회귀 기준). text 추가 전 동작 그대로.
function legacyFactory({ fetchBlocks, sleep, extractLinkId, containerTypes, maxDepth }) {
  const EXCERPT_TYPES = new Set(['paragraph','heading_1','heading_2','heading_3','callout','quote','bulleted_list_item','numbered_list_item','to_do']);
  const EXCERPT_MAX = 300;
  return async function scan(blockId, blockDepth) {
    if (blockDepth > maxDepth) return { childPages: [], mentions: [], excerpt: '' };
    await sleep(0);
    let blocks;
    try { blocks = await fetchBlocks(blockId); } catch (e) { return { childPages: [], mentions: [], excerpt: '' }; }
    const childPages = [], mentions = [];
    const excerptParts = [];
    for (const block of blocks) {
      const type = block.type, inner = block[type] || {};
      if (blockDepth === 0 && EXCERPT_TYPES.has(type)) {
        const text = (inner.rich_text || []).map(t => t.plain_text).join('').trim();
        if (text && excerptParts.join(' ').length < EXCERPT_MAX) excerptParts.push(text);
      }
      if (type === 'child_page') childPages.push({ id: block.id, title: inner.title || '(제목 없음)', isDb: false });
      else if (type === 'child_database') childPages.push({ id: block.id, title: inner.title || '(DB)', isDb: true });
      else if (type === 'link_to_page') {
        if (inner.page_id) mentions.push(inner.page_id);
        if (inner.database_id) mentions.push(inner.database_id);
      }
      for (const rt of inner.rich_text || []) {
        if (rt.type === 'mention') {
          if (rt.mention?.type === 'page') mentions.push(rt.mention.page.id);
          if (rt.mention?.type === 'database') mentions.push(rt.mention.database.id);
          continue;
        }
        const linkedId = extractLinkId(rt.href || rt.text?.link?.url);
        if (linkedId) mentions.push(linkedId);
      }
      if (containerTypes.has(type) && block.has_children) {
        const sub = await scan(block.id, blockDepth + 1);
        childPages.push(...sub.childPages);
        mentions.push(...sub.mentions);
      }
    }
    return { childPages, mentions, excerpt: excerptParts.join(' ').slice(0, EXCERPT_MAX) };
  };
}

const rt = (s, extra = {}) => [{ type: 'text', plain_text: s, text: { content: s }, ...extra }];
const blk = (type, s, extra = {}) => ({ id: `b_${Math.random()}`, type, [type]: { rich_text: rt(s) }, ...extra });

const TREE = {
  root: [
    blk('heading_1', '제목 문장'),
    blk('paragraph', 'A'.repeat(200)),
    blk('paragraph', 'B'.repeat(200)),
    blk('code', 'const secret = 1;'),
    { id: 'tog', type: 'toggle', toggle: { rich_text: rt('토글 머리') }, has_children: true },
    { id: 'cp', type: 'child_page', child_page: { title: '자식' } },
    { id: 'lk', type: 'link_to_page', link_to_page: { page_id: 'pid1' } },
  ],
  tog: [
    blk('paragraph', '토글 안쪽 문장'),
    { id: 'tog2', type: 'bulleted_list_item', bulleted_list_item: { rich_text: rt('중첩 불릿') }, has_children: true },
  ],
  tog2: [blk('quote', '깊은 인용')],
};

const deps = (maxDepth = 6) => ({
  fetchBlocks: async (id) => TREE[id] || [],
  sleep: async () => {},
  extractLinkId: () => null,
  containerTypes: new Set(['toggle', 'bulleted_list_item', 'column']),
  maxDepth,
});

test('excerpt/childPages/mentions identical to legacy implementation', async () => {
  const neu = await createPageScanner({ ...deps(), pace: 0 })('root', 0);
  const old = await legacyFactory(deps())('root', 0);
  assert.strictEqual(neu.excerpt, old.excerpt);
  assert.deepStrictEqual(neu.childPages, old.childPages);
  assert.deepStrictEqual(neu.mentions, old.mentions);
  assert.ok(neu.excerpt.length <= 300);
});

test('text includes all block types, nested, in document order', async () => {
  const r = await createPageScanner({ ...deps(), pace: 0 })('root', 0);
  const lines = r.text.split('\n');
  assert.deepStrictEqual(lines.filter(l => !/^[AB]+$/.test(l)), ['제목 문장', 'const secret = 1;', '토글 머리', '토글 안쪽 문장', '중첩 불릿', '깊은 인용']);
});

test('depth limit applies to text too', async () => {
  const r = await createPageScanner({ ...deps(1), pace: 0 })('root', 0);
  assert.ok(r.text.includes('중첩 불릿'));
  assert.ok(!r.text.includes('깊은 인용'));
});

test('fetch error yields empty text', async () => {
  const d = { ...deps(), pace: 0, fetchBlocks: async () => { throw new Error('x'); }, logError: () => {} };
  const r = await createPageScanner(d)('root', 0);
  assert.deepStrictEqual(r, { childPages: [], mentions: [], excerpt: '', text: '' });
});
