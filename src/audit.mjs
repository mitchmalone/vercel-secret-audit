import { vercelApiJson } from './auth.mjs';

const API_BASE = 'https://api.vercel.com';
const DEFAULT_LIMIT = 100;

function normalizeScope(scope) {
  if (!scope || scope === 'personal') return { label: 'personal', query: {} };
  if (scope.startsWith('team_')) return { label: scope, query: { teamId: scope } };
  return { label: scope, query: { slug: scope } };
}

function buildUrl(path, query = {}) {
  const url = new URL(path, API_BASE);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  return url;
}

async function apiFetch(token, path, query = {}) {
  const res = await fetch(buildUrl(path, query), {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });

  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    const detail = typeof body === 'string' ? body : JSON.stringify(body);
    throw new Error(`${res.status} ${res.statusText}: ${detail}`);
  }

  return body;
}

function pickItems(data, preferredKeys = []) {
  if (Array.isArray(data)) return data;
  for (const key of preferredKeys) {
    if (Array.isArray(data?.[key])) return data[key];
  }
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function pickPaginationCursor(data) {
  return data?.pagination?.next ?? data?.next ?? data?.pagination?.from ?? data?.from ?? null;
}

async function listProjectsWithFetcher(fetcher, scope) {
  const norm = normalizeScope(scope);
  const projects = [];
  let cursor = null;
  let safety = 0;

  while (safety < 100) {
    safety += 1;
    const query = { limit: DEFAULT_LIMIT, ...norm.query };
    if (cursor) query.from = cursor;
    const data = await fetcher('/v10/projects', query);
    const batch = pickItems(data, ['projects']);
    projects.push(...batch);
    const next = pickPaginationCursor(data);
    if (!next || batch.length === 0) break;
    cursor = next;
  }

  return projects;
}

async function listEnvVarsWithFetcher(fetcher, project, scope, decrypt) {
  const norm = normalizeScope(scope);
  const query = { ...norm.query, decrypt: decrypt ? 'true' : 'false' };
  const data = await fetcher(`/v10/projects/${encodeURIComponent(project.id || project.name)}/env`, query);
  return pickItems(data, ['envs', 'environmentVariables']);
}

function queryToPath(path, query = {}) {
  const url = buildUrl(path, query);
  return `${url.pathname}${url.search}`;
}

export async function listProjects(token, scope) {
  return listProjectsWithFetcher((path, query) => apiFetch(token, path, query), scope);
}

export async function listEnvVars(token, project, scope, decrypt) {
  return listEnvVarsWithFetcher((path, query) => apiFetch(token, path, query), project, scope, decrypt);
}

export async function listProjectsViaCli(scope) {
  return listProjectsWithFetcher((path, query) => vercelApiJson(queryToPath(path, query)), scope);
}

export async function listEnvVarsViaCli(project, scope, decrypt) {
  return listEnvVarsWithFetcher((path, query) => vercelApiJson(queryToPath(path, query)), project, scope, decrypt);
}

export async function discoverScopesWithToken(token) {
  const user = await apiFetch(token, '/v2/user');
  const teams = await apiFetch(token, '/v2/teams');
  return {
    personal: { label: 'personal', accountId: user?.user?.id ?? null },
    teams: Array.isArray(teams?.teams)
      ? teams.teams.map((team) => ({ label: team.slug || team.id, teamId: team.id, slug: team.slug || null }))
      : [],
  };
}

export function normalizeScopeLabel(scope) {
  return normalizeScope(scope).label;
}
