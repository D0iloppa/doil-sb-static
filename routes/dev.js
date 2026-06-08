const express = require('express');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const router = express.Router();

const configPath = path.join(__dirname, '..', 'mcp', 'config.yml');
const config = fs.existsSync(configPath) ? yaml.load(fs.readFileSync(configPath, 'utf8')) : {};
const PLANE_URL = config.plane?.url || process.env.PLANE_URL || 'http://plane:3100';
const API_KEY = config.plane?.api_key || process.env.PLANE_API_KEY;
const WORKSPACE = config.plane?.workspace || '';
const PROJECT_MAP = config.plane?.projects || {};

const STATE_GROUP_TO_FEATURE_STATUS = {
  backlog: 'PLANNED',
  unstarted: 'PLANNED',
  started: 'IN_PROGRESS',
  completed: 'DONE',
  cancelled: 'DEFERRED',
};

const STATE_GROUP_TO_TODO_STATUS = {
  backlog: 'TODO',
  unstarted: 'TODO',
  started: 'IN_PROGRESS',
  completed: 'DONE',
  cancelled: 'DONE',
};

const PLANE_PRIORITY_TO_DEV = {
  urgent: 'URGENT',
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
  none: 'MEDIUM',
};

async function planeFetch(apiPath) {
  const url = `${PLANE_URL}/api/v1${apiPath}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Plane API ${res.status}: ${body}`);
  }
  return res.json();
}

async function fetchAllIssues(workspace, projectId) {
  const issues = [];
  let cursor;
  let page = 1;
  const maxPages = 10;

  while (page <= maxPages) {
    const qs = cursor ? `?cursor=${cursor}` : '';
    const data = await planeFetch(`/workspaces/${workspace}/projects/${projectId}/issues/${qs}`);
    const batch = data.results || data;
    if (Array.isArray(batch)) issues.push(...batch);
    if (!data.next_cursor && !data.next_page_results) break;
    cursor = data.next_cursor;
    page++;
  }
  return issues;
}

async function fetchStates(workspace, projectId) {
  const data = await planeFetch(`/workspaces/${workspace}/projects/${projectId}/states/`);
  const states = data.results || data;
  const map = {};
  for (const s of states) {
    map[s.id] = { name: s.name, group: s.group };
  }
  return map;
}

async function fetchLabels(workspace, projectId) {
  const data = await planeFetch(`/workspaces/${workspace}/projects/${projectId}/labels/`);
  const labels = data.results || data;
  const map = {};
  for (const l of labels) {
    map[l.id] = l.name?.toLowerCase();
  }
  return map;
}

function getIssueLabels(issue, labelMap) {
  const ids = issue.labels || [];
  return ids.map(id => labelMap[id]).filter(Boolean);
}

function getStatusEmoji(stateGroup) {
  if (stateGroup === 'started') return '▶';
  if (stateGroup === 'completed') return '✓';
  if (stateGroup === 'cancelled') return '✕';
  return '⏸';
}

function isFeature(issue) {
  return !issue.priority || issue.priority === 'none';
}

function buildSummary(issues, stateMap, labelMap) {
  const context = {};
  const featureCounts = { PLANNED: 0, IN_PROGRESS: 0, DONE: 0, DEFERRED: 0 };
  const todoCounts = { TODO: 0, IN_PROGRESS: 0, DONE: 0, BLOCKED: 0 };

  for (const issue of issues) {
    const state = stateMap[issue.state] || {};
    const group = state.group || 'backlog';
    const labels = getIssueLabels(issue, labelMap);

    if (labels.includes('ctx')) {
      const key = issue.name?.trim();
      const value = issue.description_stripped?.trim()
        || issue.description_html?.replace(/<[^>]*>/g, '').trim()
        || '';
      if (key) {
        context[key] = { value, status: getStatusEmoji(group) };
      }
      continue;
    }

    if (isFeature(issue)) {
      const status = STATE_GROUP_TO_FEATURE_STATUS[group] || 'PLANNED';
      featureCounts[status]++;
    } else {
      if (labels.includes('blocked') || group === 'cancelled') {
        todoCounts.BLOCKED++;
      } else {
        const status = STATE_GROUP_TO_TODO_STATUS[group] || 'TODO';
        todoCounts[status]++;
      }
    }
  }

  return { context, features: featureCounts, todos: todoCounts };
}

router.get('/summary/:projectKey', async (req, res) => {
  const { projectKey } = req.params;
  const planeProjectId = PROJECT_MAP[projectKey];

  if (!planeProjectId) {
    return res.status(404).json({
      error: 'Project not mapped',
      message: `No Plane project ID configured for key "${projectKey}". Add it to mcp/config.yml under plane.projects.`,
    });
  }

  if (!API_KEY) {
    return res.status(500).json({ error: 'Plane API key not configured' });
  }

  try {
    const [issues, stateMap, labelMap] = await Promise.all([
      fetchAllIssues(WORKSPACE, planeProjectId),
      fetchStates(WORKSPACE, planeProjectId),
      fetchLabels(WORKSPACE, planeProjectId),
    ]);

    const summary = buildSummary(issues, stateMap, labelMap);
    res.json(summary);
  } catch (err) {
    console.error(`[dev/summary] Plane fetch error for ${projectKey}:`, err.message);
    res.status(502).json({ error: 'Plane API error', message: err.message });
  }
});

router.get('/projects', async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ error: 'Plane API key not configured' });
  }

  try {
    const data = await planeFetch(`/workspaces/${WORKSPACE}/projects/`);
    const projects = (data.results || data).map(p => ({
      id: p.id,
      name: p.name,
      identifier: p.identifier,
      description: p.description,
    }));
    res.json({ projects, configured: PROJECT_MAP });
  } catch (err) {
    res.status(502).json({ error: 'Plane API error', message: err.message });
  }
});

module.exports = router;
