#!/usr/bin/env node
'use strict';

// dGraph 전용 MCP 서버 (독립 stdio 프로세스).
// canvas_id 기준 그래프 캔버스 manipulate 도구를 노출한다.
// 저장소(dJinn)는 /dGraph HTTP API 뒤에 있으며 Notion dJinn(djinn MCP)과 분리된다.

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

const { tools } = require('./tools/dgraph.js');

const server = new Server(
  { name: 'dgraph', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

const toolMap = new Map(tools.map((t) => [t.name, t]));

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const tool = toolMap.get(name);

  if (!tool) {
    return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
  }

  try {
    const result = await tool.handler(args || {});
    return { content: [{ type: 'text', text: result }] };
  } catch (error) {
    return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('dgraph MCP server error:', error);
  process.exit(1);
});
