const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const configPath = path.join(__dirname, '..', 'config.yml');
const config = fs.existsSync(configPath) ? yaml.load(fs.readFileSync(configPath, 'utf8')) : {};

const JENKINS_URL = config.jenkins?.url || process.env.JENKINS_URL || 'http://localhost:8080';
const JENKINS_USER = config.jenkins?.user || process.env.JENKINS_USER;
const JENKINS_TOKEN = config.jenkins?.token || process.env.JENKINS_TOKEN;

function authHeader() {
  if (!JENKINS_USER || !JENKINS_TOKEN) throw new Error('Jenkins credentials not configured (jenkins.user / jenkins.token in config.yml)');
  return 'Basic ' + Buffer.from(`${JENKINS_USER}:${JENKINS_TOKEN}`).toString('base64');
}

async function jenkinsFetch(apiPath, options = {}) {
  const url = `${JENKINS_URL}${apiPath}`;
  const headers = { Authorization: authHeader(), ...options.headers };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Jenkins API ${res.status}: ${body.slice(0, 300)}`);
  }
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : res.text();
}

async function getCrumb() {
  try {
    const crumb = await jenkinsFetch('/crumbIssuer/api/json');
    return { [crumb.crumbRequestField]: crumb.crumb };
  } catch (_) {
    return {};
  }
}

async function jenkinsPost(apiPath, xmlBody) {
  const crumb = await getCrumb();
  const res = await fetch(`${JENKINS_URL}${apiPath}`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/xml',
      ...crumb,
    },
    body: xmlBody,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Jenkins POST ${res.status}: ${body.slice(0, 400)}`);
  }
  return res.status;
}

const tools = [
  {
    name: 'jenkins_list_jobs',
    description: 'List Jenkins jobs. Optionally filter by folder path.',
    inputSchema: {
      type: 'object',
      properties: {
        folder: { type: 'string', description: 'Folder path e.g. "my-folder". Leave empty for root.' },
      },
      required: [],
    },
    handler: async ({ folder } = {}) => {
      const basePath = folder ? `/job/${folder.split('/').join('/job/')}` : '';
      const data = await jenkinsFetch(`${basePath}/api/json?tree=jobs[name,url,color,lastBuild[number,result]]`);
      const jobs = (data.jobs || []).map(j => ({
        name: j.name,
        status: j.color,
        lastBuild: j.lastBuild ? { number: j.lastBuild.number, result: j.lastBuild.result } : null,
      }));
      return JSON.stringify(jobs, null, 2);
    },
  },
  {
    name: 'jenkins_build',
    description: 'Trigger a Jenkins job build. Supports optional parameters.',
    inputSchema: {
      type: 'object',
      properties: {
        job: { type: 'string', description: 'Full job path e.g. "my-folder/my-job" or just "my-job"' },
        params: { type: 'object', description: 'Key-value build parameters (optional)', additionalProperties: { type: 'string' } },
      },
      required: ['job'],
    },
    handler: async ({ job, params }) => {
      const jobPath = job.split('/').join('/job/');
      const hasParams = params && Object.keys(params).length > 0;
      const endpoint = hasParams ? `/job/${jobPath}/buildWithParameters` : `/job/${jobPath}/build`;
      const body = hasParams ? new URLSearchParams(params).toString() : null;
      const headers = hasParams ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {};

      // Jenkins requires crumb for CSRF
      let crumbHeader = {};
      try {
        const crumb = await jenkinsFetch('/crumbIssuer/api/json');
        crumbHeader = { [crumb.crumbRequestField]: crumb.crumb };
      } catch (_) {
        // crumb disabled — proceed without it
      }

      const res = await fetch(`${JENKINS_URL}${endpoint}`, {
        method: 'POST',
        headers: { Authorization: authHeader(), ...crumbHeader, ...headers },
        body,
      });

      if (res.status === 201 || res.status === 200) {
        const location = res.headers.get('Location') || '';
        return JSON.stringify({ status: 'queued', queueUrl: location });
      }
      const text = await res.text();
      throw new Error(`Build trigger failed ${res.status}: ${text.slice(0, 300)}`);
    },
  },
  {
    name: 'jenkins_get_build',
    description: 'Get build status/result for a Jenkins job. Defaults to the last build.',
    inputSchema: {
      type: 'object',
      properties: {
        job: { type: 'string', description: 'Full job path e.g. "my-folder/my-job"' },
        build_number: { type: 'number', description: 'Build number. Omit for latest.' },
      },
      required: ['job'],
    },
    handler: async ({ job, build_number }) => {
      const jobPath = job.split('/').join('/job/');
      const num = build_number || 'lastBuild';
      const data = await jenkinsFetch(
        `/job/${jobPath}/${num}/api/json?tree=number,result,timestamp,duration,url,building,displayName,description`
      );
      return JSON.stringify({
        number: data.number,
        result: data.result,
        building: data.building,
        displayName: data.displayName,
        duration_ms: data.duration,
        timestamp: new Date(data.timestamp).toISOString(),
        url: data.url,
      }, null, 2);
    },
  },
  {
    name: 'jenkins_console_log',
    description: 'Fetch console output of a Jenkins build. Defaults to last build.',
    inputSchema: {
      type: 'object',
      properties: {
        job: { type: 'string', description: 'Full job path e.g. "my-folder/my-job"' },
        build_number: { type: 'number', description: 'Build number. Omit for latest.' },
        tail_lines: { type: 'number', description: 'Return last N lines only (default: 100)' },
      },
      required: ['job'],
    },
    handler: async ({ job, build_number, tail_lines = 100 }) => {
      const jobPath = job.split('/').join('/job/');
      const num = build_number || 'lastBuild';
      const text = await jenkinsFetch(`/job/${jobPath}/${num}/consoleText`);
      const lines = String(text).split('\n');
      const sliced = lines.length > tail_lines ? lines.slice(-tail_lines) : lines;
      return sliced.join('\n');
    },
  },
  {
    name: 'jenkins_create_folder',
    description: 'Create a Jenkins folder. Use slash-separated path for nested folders e.g. "parent/child".',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Slash-separated folder path to create. e.g. "saigon_rider" or "saigon_rider/dev"' },
      },
      required: ['path'],
    },
    handler: async ({ path: folderPath }) => {
      const parts = folderPath.split('/').filter(Boolean);
      const name = parts.pop();
      const parentPath = parts.length ? '/job/' + parts.join('/job/') : '';
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<com.cloudbees.hudson.plugins.folder.Folder plugin="cloudbees-folder">
  <description></description>
  <views><hudson.model.AllView><name>All</name></hudson.model.AllView></views>
</com.cloudbees.hudson.plugins.folder.Folder>`;
      await jenkinsPost(`${parentPath}/createItem?name=${encodeURIComponent(name)}`, xml);
      return JSON.stringify({ created: folderPath });
    },
  },
  {
    name: 'jenkins_create_job',
    description: 'Create a Jenkins FreeStyle job inside a folder.',
    inputSchema: {
      type: 'object',
      properties: {
        folder: { type: 'string', description: 'Parent folder path e.g. "saigon_rider/dev"' },
        name: { type: 'string', description: 'Job name e.g. "frontend_build"' },
        shell_command: { type: 'string', description: 'Shell command to run in the build step' },
        description: { type: 'string', description: 'Job description (optional)' },
      },
      required: ['folder', 'name', 'shell_command'],
    },
    handler: async ({ folder, name, shell_command, description: desc = '' }) => {
      const folderPath = '/job/' + folder.split('/').join('/job/');
      const escaped = shell_command.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<project>
  <description>${desc}</description>
  <keepDependencies>false</keepDependencies>
  <properties/>
  <scm class="hudson.scm.NullSCM"/>
  <builders>
    <hudson.tasks.Shell>
      <command>${escaped}</command>
    </hudson.tasks.Shell>
  </builders>
  <publishers/>
  <buildWrappers/>
</project>`;
      await jenkinsPost(`${folderPath}/createItem?name=${encodeURIComponent(name)}`, xml);
      return JSON.stringify({ created: `${folder}/${name}`, command: shell_command });
    },
  },
];

module.exports = { tools };
