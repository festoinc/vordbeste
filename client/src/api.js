const BASE = '';

let cachedToken = null;
let tokenPromise = null;

function readMetaToken() {
  if (typeof document === 'undefined') return null;
  const el = document.querySelector('meta[name="vordbeste-token"]');
  return el?.getAttribute('content') || null;
}

async function getToken() {
  if (cachedToken) return cachedToken;
  const meta = readMetaToken();
  if (meta) {
    cachedToken = meta;
    return cachedToken;
  }
  if (!tokenPromise) {
    tokenPromise = fetch(`${BASE}/api/launch-token`, { credentials: 'omit' })
      .then(r => r.ok ? r.json() : null)
      .then(data => { cachedToken = data?.token || null; return cachedToken; })
      .catch(() => null);
  }
  return tokenPromise;
}

async function authHeaders(extra = {}) {
  const token = await getToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

async function apiFetch(path, opts = {}) {
  const headers = await authHeaders(opts.headers || {});
  return fetch(`${BASE}${path}`, { ...opts, headers, credentials: 'omit' });
}

export async function getConfig() {
  const res = await apiFetch(`/api/config`);
  return res.json();
}

export async function saveConfig(data) {
  const res = await apiFetch(`/api/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function patchConfig(data) {
  const res = await apiFetch(`/api/config`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteAllData() {
  const res = await apiFetch(`/api/config/all-data`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Failed' }));
    throw new Error(data.error || 'Failed to delete data');
  }
  return res.json();
}

export async function fetchCurrentModels() {
  const res = await apiFetch(`/api/models/current`);
  if (!res.ok) throw new Error('Failed to fetch models');
  return res.json();
}

export async function fetchModels(provider, apiKey) {
  const res = await apiFetch(`/api/models`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, apiKey }),
  });
  return res.json();
}

export async function getDatabases() {
  const res = await apiFetch(`/api/databases`);
  return res.json();
}

export async function getDatabase(slug) {
  const res = await apiFetch(`/api/databases/${slug}`);
  return res.json();
}

export async function getSessions(slug) {
  const res = await apiFetch(`/api/databases/${slug}/sessions`);
  return res.json();
}

export async function getSession(slug, sessionId) {
  const res = await apiFetch(`/api/databases/${slug}/sessions/${sessionId}`);
  return res.json();
}

export function streamChat(body, onEvent) {
  return new Promise(async (resolve, reject) => {
    try {
      const res = await apiFetch(`/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        reject(new Error(err.error || 'Request failed'));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6));
              onEvent(event);
            } catch {}
          }
        }
      }
      resolve();
    } catch (err) {
      reject(err);
    }
  });
}
