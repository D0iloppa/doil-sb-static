const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const configPath = path.join(__dirname, '..', 'config.yml');
const config = fs.existsSync(configPath) ? yaml.load(fs.readFileSync(configPath, 'utf8')) : {};

const PLANE_URL = config.plane?.url || process.env.PLANE_URL || 'http://plane:3100';
const API_KEY = config.plane?.api_key || process.env.PLANE_API_KEY;
const DEFAULT_WORKSPACE = config.plane?.workspace || '';

async function planeFetch(path, options = {}) {
  const url = `${PLANE_URL}/api/v1${path}`;
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': API_KEY,
    ...options.headers,
  };

  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Plane API ${res.status}: ${body}`);
  }
  return res.json();
}

const tools = [
  {
    name: 'plane_list_workspaces',
    description: 'List all workspaces in Plane',
    inputSchema: { type: 'object', properties: {}, required: [] },
    handler: async () => {
      const data = await planeFetch('/workspaces/');
      const workspaces = (data.results || data).map(w => ({
        id: w.id,
        name: w.name,
        slug: w.slug,
      }));
      return JSON.stringify(workspaces, null, 2);
    },
  },
  {
    name: 'plane_list_projects',
    description: 'List all projects in a workspace',
    inputSchema: {
      type: 'object',
      properties: { workspace: { type: 'string', description: 'Workspace slug' } },
      required: [],
    },
    handler: async ({ workspace }) => {
      const data = await planeFetch(`/workspaces/${workspace || DEFAULT_WORKSPACE}/projects/`);
      const projects = (data.results || data).map(p => ({
        id: p.id,
        name: p.name,
        identifier: p.identifier,
        description: p.description,
      }));
      return JSON.stringify(projects, null, 2);
    },
  },
  {
    name: 'plane_create_project',
    description: 'Create a new project in a workspace',
    inputSchema: {
      type: 'object',
      properties: {
        workspace: { type: 'string', description: 'Workspace slug' },
        name: { type: 'string', description: 'Project name' },
        identifier: { type: 'string', description: 'Short uppercase project identifier (e.g. DSB)' },
        description: { type: 'string', description: 'Project description' },
      },
      required: ['name', 'identifier'],
    },
    handler: async ({ workspace, name, identifier, description }) => {
      const body = { name, identifier: identifier.toUpperCase() };
      if (description) body.description = description;
      const data = await planeFetch(`/workspaces/${workspace || DEFAULT_WORKSPACE}/projects/`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return JSON.stringify({ id: data.id, name: data.name, identifier: data.identifier }, null, 2);
    },
  },
  {
    name: 'plane_list_issues',
    description: 'List issues in a project',
    inputSchema: {
      type: 'object',
      properties: {
        workspace: { type: 'string', description: 'Workspace slug' },
        project: { type: 'string', description: 'Project ID' },
        state: { type: 'string', description: 'Filter by state name' },
      },
      required: ['project'],
    },
    handler: async ({ workspace, project, state }) => {
      let path = `/workspaces/${workspace}/projects/${project}/issues/`;
      if (state) path += `?state__name=${encodeURIComponent(state)}`;
      const data = await planeFetch(path);
      const issues = (data.results || data).map(i => ({
        id: i.id,
        name: i.name,
        description: i.description_stripped,
        state: i.state_detail?.name,
        priority: i.priority,
        assignees: i.assignee_details?.map(a => a.display_name),
        labels: i.label_details?.map(l => l.name),
        created_at: i.created_at,
        updated_at: i.updated_at,
      }));
      return JSON.stringify({ total: data.total_results || issues.length, issues }, null, 2);
    },
  },
  {
    name: 'plane_create_issue',
    description: 'Create a new issue in a project',
    inputSchema: {
      type: 'object',
      properties: {
        workspace: { type: 'string', description: 'Workspace slug' },
        project: { type: 'string', description: 'Project ID' },
        name: { type: 'string', description: 'Issue title' },
        description: { type: 'string', description: 'Issue description (markdown)' },
        priority: { type: 'string', description: 'Priority: urgent, high, medium, low, none' },
        state: { type: 'string', description: 'State ID' },
      },
      required: ['project', 'name'],
    },
    handler: async ({ workspace, project, name, description, priority, state }) => {
      const body = { name };
      if (description) body.description_html = `<p>${description}</p>`;
      if (priority) body.priority = priority;
      if (state) body.state = state;

      const data = await planeFetch(`/workspaces/${workspace || DEFAULT_WORKSPACE}/projects/${project}/issues/`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return JSON.stringify({ id: data.id, name: data.name, state: data.state_detail?.name }, null, 2);
    },
  },
  {
    name: 'plane_update_issue',
    description: 'Update an existing issue',
    inputSchema: {
      type: 'object',
      properties: {
        workspace: { type: 'string', description: 'Workspace slug' },
        project: { type: 'string', description: 'Project ID' },
        issue: { type: 'string', description: 'Issue ID' },
        name: { type: 'string', description: 'New title' },
        priority: { type: 'string', description: 'New priority' },
        state: { type: 'string', description: 'New state ID' },
      },
      required: ['project', 'issue'],
    },
    handler: async ({ workspace, project, issue, name, priority, state }) => {
      const body = {};
      if (name) body.name = name;
      if (priority) body.priority = priority;
      if (state) body.state = state;

      const data = await planeFetch(`/workspaces/${workspace || DEFAULT_WORKSPACE}/projects/${project}/issues/${issue}/`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      return JSON.stringify({ id: data.id, name: data.name, state: data.state_detail?.name }, null, 2);
    },
  },
  {
    name: 'plane_list_states',
    description: 'List all states (workflow statuses) in a project',
    inputSchema: {
      type: 'object',
      properties: {
        workspace: { type: 'string', description: 'Workspace slug' },
        project: { type: 'string', description: 'Project ID' },
      },
      required: ['project'],
    },
    handler: async ({ workspace, project }) => {
      const data = await planeFetch(`/workspaces/${workspace || DEFAULT_WORKSPACE}/projects/${project}/states/`);
      const states = (data.results || data).map(s => ({
        id: s.id,
        name: s.name,
        group: s.group,
        color: s.color,
      }));
      return JSON.stringify(states, null, 2);
    },
  },
  {
    name: 'plane_list_labels',
    description: 'List all labels in a project',
    inputSchema: {
      type: 'object',
      properties: {
        workspace: { type: 'string', description: 'Workspace slug' },
        project: { type: 'string', description: 'Project ID' },
      },
      required: ['project'],
    },
    handler: async ({ workspace, project }) => {
      const data = await planeFetch(`/workspaces/${workspace || DEFAULT_WORKSPACE}/projects/${project}/labels/`);
      const labels = (data.results || data).map(l => ({
        id: l.id,
        name: l.name,
        color: l.color,
      }));
      return JSON.stringify(labels, null, 2);
    },
  },
];

module.exports = { tools };
