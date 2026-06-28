'use strict';

const DOIL_SB = process.env.DOIL_SB_URL || 'https://doil.me/sb';

const tools = [
  {
    name: 'graph_full_scan',
    description:
      'DJinn 노션 메타데이터 전체 재스캔. DOYCLOPEDIA 루트부터 전체 페이지 트리를 탐색해 ' +
      'notion_meta.db의 nodes/edges를 갱신한다. 수 분 소요. 이미 스캔 중이면 즉시 반환.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    handler: async () => {
      const res = await fetch(`${DOIL_SB}/graph/scan`, { method: 'POST' });
      if (!res.ok) throw new Error(`scan failed: ${res.status}`);
      return JSON.stringify(await res.json());
    },
  },
  {
    name: 'graph_sub_scan',
    description:
      '특정 노션 페이지와 그 하위 트리만 부분 재스캔. 페이지 생성·수정 후 DJinn 캐시를 ' +
      '빠르게 갱신할 때 사용한다. 이미 스캔 중이면 즉시 반환.',
    inputSchema: {
      type: 'object',
      properties: {
        page_id: {
          type: 'string',
          description: '재스캔할 노션 페이지 ID (UUID — 하이픈 유무 무관)',
        },
      },
      required: ['page_id'],
    },
    handler: async ({ page_id }) => {
      const id = page_id.replace(/-/g, '');
      const res = await fetch(`${DOIL_SB}/graph/scan/${id}`, { method: 'POST' });
      if (!res.ok) throw new Error(`sub-scan failed: ${res.status}`);
      return JSON.stringify(await res.json());
    },
  },
  {
    name: 'graph_search',
    description:
      '노션 페이지 제목으로 LIKE 검색. 부분 일치 키워드를 받아 DJinn 캐시에서 매칭 노드를 반환한다.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: '검색 키워드 (부분 일치)' },
      },
      required: ['q'],
    },
    handler: async ({ q }) => {
      const res = await fetch(`${DOIL_SB}/graph/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error(`search failed: ${res.status}`);
      return JSON.stringify(await res.json());
    },
  },
  {
    name: 'graph_export_csv',
    description:
      'DJinn 노드를 CSV 형태로 내보낸다. 지정한 컬럼만 포함. ' +
      'props 안의 키(저자, 상태 등)도 컬럼명으로 직접 지정 가능. limit/offset으로 페이징 지원.',
    inputSchema: {
      type: 'object',
      properties: {
        columns: {
          type: 'array',
          items: { type: 'string' },
          description: '포함할 컬럼 목록. "field:헤더별칭" 형식으로 헤더명 지정 가능 (예: ["id","title:제목","grp:그룹","저자"])',
        },
        grp:    { type: 'string',  description: '그룹 필터 (선택)' },
        q:      { type: 'string',  description: '제목 검색어 (선택)' },
        parent: { type: 'string',  description: '특정 페이지의 직계 자식만 필터 — 페이지 ID (선택)' },
        limit:    { type: 'integer', description: '최대 행 수 (선택)' },
        offset:   { type: 'integer', description: '건너뛸 행 수, 기본 0 (선택)' },
        order_by: { type: 'string',  description: '정렬 기준. "field" 또는 "field:asc|desc" 형식 (예: "title:asc", "저자:desc")' },
      },
      required: ['columns'],
    },
    handler: async ({ columns, grp, q, parent, limit, offset, order_by }) => {
      const params = new URLSearchParams({ columns: columns.join(',') });
      if (grp)      params.set('grp', grp);
      if (q)        params.set('q', q);
      if (parent)   params.set('parent', parent.replace(/-/g, ''));
      if (limit    != null) params.set('limit',    limit);
      if (offset   != null) params.set('offset',   offset);
      if (order_by)         params.set('order_by', order_by);
      const res = await fetch(`${DOIL_SB}/graph/csv?${params}`);
      if (!res.ok) throw new Error(`export failed: ${res.status}`);
      return await res.text();
    },
  },
  {
    name: 'graph_list_children',
    description: '특정 노션 페이지의 직계 자식 노드 목록을 반환한다. limit/offset으로 페이징 가능.',
    inputSchema: {
      type: 'object',
      properties: {
        page_id: { type: 'string',  description: '부모 노션 페이지 ID (UUID — 하이픈 유무 무관)' },
        limit:    { type: 'integer', description: '최대 노드 수 (선택)' },
        offset:   { type: 'integer', description: '건너뛸 노드 수, 기본 0 (선택)' },
        order_by: { type: 'string',  description: '정렬 기준. "field" 또는 "field:asc|desc" 형식 (예: "title:asc")' },
      },
      required: ['page_id'],
    },
    handler: async ({ page_id, limit, offset, order_by }) => {
      const id = page_id.replace(/-/g, '');
      const params = new URLSearchParams();
      if (limit    != null) params.set('limit',    limit);
      if (offset   != null) params.set('offset',   offset);
      if (order_by)         params.set('order_by', order_by);
      const res = await fetch(`${DOIL_SB}/graph/children/${id}?${params}`);
      if (!res.ok) throw new Error(`list children failed: ${res.status}`);
      return JSON.stringify(await res.json());
    },
  },
  {
    name: 'graph_count_children',
    description:
      '특정 노션 페이지의 직계 자식 노드 수를 반환한다. edges 테이블에서 source = page_id 인 행을 카운트.',
    inputSchema: {
      type: 'object',
      properties: {
        page_id: { type: 'string', description: '부모 노션 페이지 ID (UUID — 하이픈 유무 무관)' },
      },
      required: ['page_id'],
    },
    handler: async ({ page_id }) => {
      const id = page_id.replace(/-/g, '');
      const res = await fetch(`${DOIL_SB}/graph/children/count/${id}`);
      if (!res.ok) throw new Error(`count failed: ${res.status}`);
      return JSON.stringify(await res.json());
    },
  },
];

module.exports = { tools };
