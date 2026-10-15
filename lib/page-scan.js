'use strict';

// 한 페이지 내부 블록 재귀 스캔. routes/graph.js 에서 분리했다(DB를 열지 않고 테스트하기 위해).
// childPages / mentions / excerpt 동작은 분리 전과 동일하다. 추가된 text 는 임베딩 입력용이며
// 메모리에만 둔다(DB·로그·파일에 쓰지 않는다).

const EXCERPT_TYPES = new Set([
  'paragraph', 'heading_1', 'heading_2', 'heading_3',
  'callout', 'quote', 'bulleted_list_item', 'numbered_list_item', 'to_do',
]);
const EXCERPT_MAX = 300;

/**
 * @param {object} deps
 *  fetchBlocks(blockId) -> block[]; sleep(ms); extractLinkId(url) -> id|null;
 *  containerTypes: Set; maxDepth: number; pace: ms (기본 350)
 */
function createPageScanner({ fetchBlocks, sleep, extractLinkId, containerTypes, maxDepth, pace = 350, logError = console.error }) {
  const empty = () => ({ childPages: [], mentions: [], excerpt: '', text: '' });

  async function scanPageContent(blockId, blockDepth) {
    if (blockDepth > maxDepth) return empty();
    await sleep(pace);
    let blocks;
    try { blocks = await fetchBlocks(blockId); }
    catch (e) { logError(`[graph] fetchBlocks(${blockId}) failed:`, e.message); return empty(); }

    const childPages = [], mentions = [];
    const excerptParts = [];
    const textParts = [];

    for (const block of blocks) {
      const type = block.type, inner = block[type] || {};

      // depth=0 에서만 텍스트 수집 (300자 이내)
      if (blockDepth === 0 && EXCERPT_TYPES.has(type)) {
        const text = (inner.rich_text || []).map(t => t.plain_text).join('').trim();
        if (text && excerptParts.join(' ').length < EXCERPT_MAX) excerptParts.push(text);
      }

      // 임베딩용 본문: 모든 블록 타입의 rich_text (메모리 전용)
      if (Array.isArray(inner.rich_text) && inner.rich_text.length) {
        const t = inner.rich_text.map(r => r.plain_text || '').join('').trim();
        if (t) textParts.push(t);
      }

      if (type === 'child_page')         childPages.push({ id: block.id, title: inner.title || '(제목 없음)', isDb: false });
      else if (type === 'child_database') childPages.push({ id: block.id, title: inner.title || '(DB)', isDb: true });
      else if (type === 'link_to_page') {
        if (inner.page_id)     mentions.push(inner.page_id);
        if (inner.database_id) mentions.push(inner.database_id);
      }
      for (const rt of inner.rich_text || []) {
        if (rt.type === 'mention') {
          if (rt.mention?.type === 'page')     mentions.push(rt.mention.page.id);
          if (rt.mention?.type === 'database') mentions.push(rt.mention.database.id);
          continue;
        }
        // 일반 텍스트에 걸린 하이퍼링크(마크다운 링크 등)가 노션 페이지를 가리키면 참조선으로 잡는다
        const linkedId = extractLinkId(rt.href || rt.text?.link?.url);
        if (linkedId) mentions.push(linkedId);
      }
      if (containerTypes.has(type) && block.has_children) {
        const sub = await scanPageContent(block.id, blockDepth + 1);
        childPages.push(...sub.childPages);
        mentions.push(...sub.mentions);
        if (sub.text) textParts.push(sub.text);
      }
    }
    return { childPages, mentions, excerpt: excerptParts.join(' ').slice(0, EXCERPT_MAX), text: textParts.join('\n') };
  }
  return scanPageContent;
}

module.exports = { createPageScanner, EXCERPT_TYPES, EXCERPT_MAX };
