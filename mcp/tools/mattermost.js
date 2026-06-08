const MM_URL = process.env.MATTERMOST_URL || 'http://mattermost:8065';
const MM_TOKEN = process.env.MATTERMOST_TOKEN;

async function mmFetch(path, options = {}) {
  const url = `${MM_URL}/api/v4${path}`;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${MM_TOKEN}`,
    ...options.headers,
  };

  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Mattermost API ${res.status}: ${body}`);
  }
  return res.json();
}

const tools = [
  {
    name: 'mm_list_channels',
    description: 'List channels in a Mattermost team',
    inputSchema: {
      type: 'object',
      properties: {
        teamId: { type: 'string', description: 'Team ID' },
      },
      required: ['teamId'],
    },
    handler: async ({ teamId }) => {
      const data = await mmFetch(`/teams/${teamId}/channels`);
      const channels = data.map(c => ({
        id: c.id,
        name: c.name,
        displayName: c.display_name,
        type: c.type,
        purpose: c.purpose,
      }));
      return JSON.stringify(channels, null, 2);
    },
  },
  {
    name: 'mm_post_message',
    description: 'Post a message to a Mattermost channel',
    inputSchema: {
      type: 'object',
      properties: {
        channelId: { type: 'string', description: 'Channel ID' },
        message: { type: 'string', description: 'Message text (markdown supported)' },
      },
      required: ['channelId', 'message'],
    },
    handler: async ({ channelId, message }) => {
      const data = await mmFetch('/posts', {
        method: 'POST',
        body: JSON.stringify({ channel_id: channelId, message }),
      });
      return JSON.stringify({ id: data.id, message: data.message, createAt: data.create_at }, null, 2);
    },
  },
  {
    name: 'mm_get_posts',
    description: 'Get recent posts from a Mattermost channel',
    inputSchema: {
      type: 'object',
      properties: {
        channelId: { type: 'string', description: 'Channel ID' },
        perPage: { type: 'number', description: 'Number of posts to fetch (default 20)' },
      },
      required: ['channelId'],
    },
    handler: async ({ channelId, perPage = 20 }) => {
      const data = await mmFetch(`/channels/${channelId}/posts?per_page=${perPage}`);
      const posts = data.order.map(id => {
        const p = data.posts[id];
        return { id: p.id, message: p.message, userId: p.user_id, createAt: p.create_at };
      });
      return JSON.stringify(posts, null, 2);
    },
  },
  {
    name: 'mm_list_teams',
    description: 'List all Mattermost teams',
    inputSchema: { type: 'object', properties: {}, required: [] },
    handler: async () => {
      const data = await mmFetch('/teams');
      const teams = data.map(t => ({
        id: t.id,
        name: t.name,
        displayName: t.display_name,
      }));
      return JSON.stringify(teams, null, 2);
    },
  },
  {
    name: 'mm_share_file_link',
    description: 'Post a Google Drive file link to a Mattermost channel with metadata',
    inputSchema: {
      type: 'object',
      properties: {
        channelId: { type: 'string', description: 'Channel ID' },
        fileName: { type: 'string', description: 'File name' },
        driveUrl: { type: 'string', description: 'Google Drive sharing URL' },
        description: { type: 'string', description: 'Optional file description' },
      },
      required: ['channelId', 'fileName', 'driveUrl'],
    },
    handler: async ({ channelId, fileName, driveUrl, description }) => {
      const message = `**File Shared:** ${fileName}\n${description ? `> ${description}\n` : ''}[Open in Google Drive](${driveUrl})`;
      const data = await mmFetch('/posts', {
        method: 'POST',
        body: JSON.stringify({ channel_id: channelId, message }),
      });
      return JSON.stringify({ id: data.id, message: data.message }, null, 2);
    },
  },
];

module.exports = { tools };
