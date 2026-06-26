#!/usr/bin/env node

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

const { tools: planeTools } = require('./tools/plane.js');
const { tools: mmTools } = require('./tools/mattermost.js');
const { tools: stockTools } = require('./tools/stock.js');
const { tools: jenkinsTools } = require('./tools/jenkins.js');

const allTools = [...planeTools, ...mmTools, ...stockTools, ...jenkinsTools];

const server = new Server(
  { name: 'doil-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

const toolMap = new Map(allTools.map(t => [t.name, t]));

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: allTools.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  })),
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
  console.error('MCP server error:', error);
  process.exit(1);
});
