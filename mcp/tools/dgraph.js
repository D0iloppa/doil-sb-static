'use strict';

// dGraph — canvas_id 기준 인터랙티브 그래프 캔버스 manipulate 도구.
// doil-sb의 /dGraph HTTP API를 호출하는 얇은 클라이언트 (Notion dJinn과 분리).

const DOIL_SB = process.env.DOIL_SB_URL || 'https://doil.me/sb';
const BASE = `${DOIL_SB}/dGraph`;

async function call(method, url, body) {
  const opt = { method, headers: {} };
  if (body !== undefined) {
    opt.headers['Content-Type'] = 'application/json';
    opt.body = JSON.stringify(body);
  }
  const res = await fetch(url, opt);
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status}: ${text}`);
  return text; // 서버 응답이 이미 JSON 문자열
}

const shapeSchema = {
  type: 'object',
  description: '노드 모양/크기/색. 미지정 시 type별 기본값.',
  properties: {
    kind:  { type: 'string', enum: ['circle', 'square', 'diamond', 'cylinder'], description: '모양' },
    size:  { type: 'number', description: '반지름(그래프 좌표), 3~60 권장' },
    color: { type: 'string', description: 'HEX 색상 (#rrggbb)' },
  },
};

const tools = [
  {
    name: 'dgraph_create_canvas',
    description: '새 dGraph 캔버스를 생성한다. base(루트) 노드가 자동 생성되며 canvas_id와 접속 URL을 반환한다.',
    inputSchema: {
      type: 'object',
      properties: { title: { type: 'string', description: '캔버스 제목 (기본 "Canvas")' } },
      required: [],
    },
    handler: async ({ title }) => call('POST', BASE, title !== undefined ? { title } : {}),
  },
  {
    name: 'dgraph_list_canvases',
    description: '모든 dGraph 캔버스 목록(id, title, 생성/수정일)을 최근 수정순으로 반환한다.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    handler: async () => call('GET', `${BASE}/list`),
  },
  {
    name: 'dgraph_rename_canvas',
    description: '캔버스 이름을 변경한다. 반환: { ok, title }.',
    inputSchema: {
      type: 'object',
      properties: {
        canvas_id: { type: 'string', description: '캔버스 ID' },
        title:     { type: 'string', description: '새 이름 (공백 불가)' },
      },
      required: ['canvas_id', 'title'],
    },
    handler: async ({ canvas_id, title }) => call('PATCH', `${BASE}/${canvas_id}`, { title }),
  },
  {
    name: 'dgraph_get_canvas',
    description: '캔버스의 전체 그래프(노드/엣지)를 반환한다. 각 노드에는 base로부터 도달 불가 여부(orphan) 플래그가 포함된다.',
    inputSchema: {
      type: 'object',
      properties: { canvas_id: { type: 'string', description: '캔버스 ID (16자리 hex)' } },
      required: ['canvas_id'],
    },
    handler: async ({ canvas_id }) => call('GET', `${BASE}/${canvas_id}/data`),
  },
  {
    name: 'dgraph_get_sublist',
    description: '캔버스에서 특정 노드 이하(자신 포함)로 도달 가능한 서브그래프(노드/엣지)만 반환한다. 캔버스가 비대해져 전체를 다 볼 필요 없을 때 사용.',
    inputSchema: {
      type: 'object',
      properties: {
        canvas_id: { type: 'string', description: '캔버스 ID (16자리 hex)' },
        node_id:   { type: 'string', description: '기준 노드 ID — 이 노드와 하위 전체를 반환' },
      },
      required: ['canvas_id', 'node_id'],
    },
    handler: async ({ canvas_id, node_id }) => call('GET', `${BASE}/${canvas_id}/sublist/data?id=${encodeURIComponent(node_id)}`),
  },
  {
    name: 'dgraph_delete_subtree',
    description: '노드와 그 하위 전체(서브트리)를 한 번에 삭제하고 관련 엣지(내부+바깥에서 들어오는 연결)도 함께 정리한다. 세션/리텐션 정리용. base 노드는 삭제 불가. 반환: { ok, deletedNodes, deletedEdges }.',
    inputSchema: {
      type: 'object',
      properties: {
        canvas_id: { type: 'string', description: '캔버스 ID' },
        node_id:   { type: 'string', description: '삭제할 서브트리의 루트 노드 ID (base 불가)' },
      },
      required: ['canvas_id', 'node_id'],
    },
    handler: async ({ canvas_id, node_id }) => call('DELETE', `${BASE}/${canvas_id}/subtree/${node_id}`),
  },
  {
    name: 'dgraph_add_node',
    description: '캔버스에 노드를 추가한다. parent_id 지정 시 parent→새노드 엣지를 자동 생성하고, 미지정 시 독립(orphan) 노드가 된다. 반환: { id }.',
    inputSchema: {
      type: 'object',
      properties: {
        canvas_id: { type: 'string', description: '캔버스 ID' },
        title:     { type: 'string', description: '노드 제목' },
        type:      { type: 'string', description: '노드 타입 (기본 "node"). 자유 문자열' },
        parent_id: { type: 'string', description: '부모 노드 ID (예: "base"). 지정 시 parent→새노드 엣지 자동 생성' },
        desc:      { type: 'string', description: '설명' },
        shape:     shapeSchema,
        extra:     { type: 'object', description: '_extra 자유 JSON 페이로드' },
      },
      required: ['canvas_id', 'title'],
    },
    handler: async ({ canvas_id, title, type, parent_id, desc, shape, extra }) =>
      call('POST', `${BASE}/${canvas_id}/node`, { title, type, parentId: parent_id, desc, shape, _extra: extra }),
  },
  {
    name: 'dgraph_add_group',
    description: '캔버스에 그룹 노드(type=group)를 추가한다. parent_id 지정 시 엣지 자동 생성. 반환: { id }.',
    inputSchema: {
      type: 'object',
      properties: {
        canvas_id: { type: 'string', description: '캔버스 ID' },
        title:     { type: 'string', description: '그룹 제목' },
        parent_id: { type: 'string', description: '부모 노드 ID' },
        shape:     shapeSchema,
        extra:     { type: 'object', description: '_extra 자유 JSON' },
      },
      required: ['canvas_id', 'title'],
    },
    handler: async ({ canvas_id, title, parent_id, shape, extra }) =>
      call('POST', `${BASE}/${canvas_id}/group`, { title, parentId: parent_id, shape, _extra: extra }),
  },
  {
    name: 'dgraph_update_node',
    description: '노드의 title/type/shape/desc/_extra를 수정한다. 전달한 필드만 갱신. base 노드도 수정 가능(삭제만 금지).',
    inputSchema: {
      type: 'object',
      properties: {
        canvas_id: { type: 'string', description: '캔버스 ID' },
        node_id:   { type: 'string', description: '대상 노드 ID' },
        title:     { type: 'string' },
        type:      { type: 'string' },
        desc:      { type: 'string' },
        shape:     shapeSchema,
        extra:     { type: 'object', description: '_extra 전체 교체' },
      },
      required: ['canvas_id', 'node_id'],
    },
    handler: async ({ canvas_id, node_id, title, type, desc, shape, extra }) => {
      const body = {};
      if (title !== undefined) body.title = title;
      if (type  !== undefined) body.type = type;
      if (desc  !== undefined) body.desc = desc;
      if (shape !== undefined) body.shape = shape;
      if (extra !== undefined) body._extra = extra;
      return call('PATCH', `${BASE}/${canvas_id}/node/${node_id}`, body);
    },
  },
  {
    name: 'dgraph_delete_node',
    description: '노드를 삭제하고 그 노드에 연결된 엣지를 함께 정리한다. base 노드는 삭제할 수 없다.',
    inputSchema: {
      type: 'object',
      properties: {
        canvas_id: { type: 'string', description: '캔버스 ID' },
        node_id:   { type: 'string', description: '대상 노드 ID (base 불가)' },
      },
      required: ['canvas_id', 'node_id'],
    },
    handler: async ({ canvas_id, node_id }) => call('DELETE', `${BASE}/${canvas_id}/node/${node_id}`),
  },
  {
    name: 'dgraph_add_edge',
    description: 'source→target 엣지를 연결한다(방향 있음). 자기참조 불가, 같은 방향 쌍은 upsert. orphan 노드 재연결에도 사용. 반환: { id }.',
    inputSchema: {
      type: 'object',
      properties: {
        canvas_id: { type: 'string', description: '캔버스 ID' },
        source:    { type: 'string', description: '출발 노드 ID' },
        target:    { type: 'string', description: '도착 노드 ID' },
        type:      { type: 'string', description: '엣지 타입 (기본 "link")' },
      },
      required: ['canvas_id', 'source', 'target'],
    },
    handler: async ({ canvas_id, source, target, type }) =>
      call('POST', `${BASE}/${canvas_id}/edge`, { source, target, type }),
  },
  {
    name: 'dgraph_delete_edge',
    description: '엣지를 삭제한다. edge_id는 보통 "<source>__<target>" 형식이며 dgraph_get_canvas의 edges[].id로 확인할 수 있다.',
    inputSchema: {
      type: 'object',
      properties: {
        canvas_id: { type: 'string', description: '캔버스 ID' },
        edge_id:   { type: 'string', description: '엣지 ID (edges[].id)' },
      },
      required: ['canvas_id', 'edge_id'],
    },
    handler: async ({ canvas_id, edge_id }) => call('DELETE', `${BASE}/${canvas_id}/edge/${edge_id}`),
  },
];

module.exports = { tools };
