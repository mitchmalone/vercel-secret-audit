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

export async function listProjects(token, scope) {
  const norm = normalizeScope(scope);
  const projects = [];
  let cursor = null;
  let safety = 0;

  while (safety < 100) {
    safety += 1;
    const query = { limit: DEFAULT_LIMIT, ...norm.query };
    if (cursor) query.from = cursor;
    const data = await apiFetch(token, '/v10/projects', query);
    const batch = pickItems(data, ['projects']);
    projects.push(...batch);
    const next = pickPaginationCursor(data);
    if (!next || batch.length === 0) break;
    cursor = next;
  }

  return projects;
}

export async function listEnvVars(token, project, scope, decrypt) {
  const norm = normalizeScope(scope);
  const query = { ...norm.query, decrypt: decrypt ? 'true' : 'false' };
  const data = await apiFetch(token, `/v10/projects/${encodeURIComponent(project.id || project.name)}/env`, query);
  return pickItems(data, ['envs', 'environmentVariables']);
}

export function normalizeScopeLabel(scope) {
  return normalizeScope(scope).label;
}
