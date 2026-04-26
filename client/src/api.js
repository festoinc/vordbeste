const BASE = '';

export async function getConfig() {
  const res = await fetch(`${BASE}/api/config`);
  return res.json();
}

export async function saveConfig(data) {
  const res = await fetch(`${BASE}/api/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function patchConfig(data) {
  const res = await fetch(`${BASE}/api/config`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteAllData() {
  const res = await fetch(`${BASE}/api/config/all-data`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Failed' }));
    throw new Error(data.error || 'Failed to delete data');
  }
  return res.json();
}

export async function fetchCurrentModels() {
  const res = await fetch(`${BASE}/api/models/current`);
  if (!res.ok) throw new Error('Failed to fetch models');
  return res.json();
}

export async function fetchModels(provider, apiKey) {
  const res = await fetch(`${BASE}/api/models`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, apiKey }),
  });
  return res.json();
}

export async function getDatabases() {
  const res = await fetch(`${BASE}/api/databases`);
  return res.json();
}

export async function getDatabase(slug) {
  const res = await fetch(`${BASE}/api/databases/${slug}`);
  return res.json();
}

export async function getSessions(slug) {
  const res = await fetch(`${BASE}/api/databases/${slug}/sessions`);
  return res.json();
}

export async function getSession(slug, sessionId) {
  const res = await fetch(`${BASE}/api/databases/${slug}/sessions/${sessionId}`);
  return res.json();
}

/**
 * Stream a chat turn via SSE.
 * @param {object} body - { messages, slug, sessionId, isConnectPage }
 * @param {function} onEvent - called for each parsed event
 * @returns {Promise} resolves when stream ends
 */
export function streamChat(body, onEvent) {
  return new Promise(async (resolve, reject) => {
    try {
      const res = await fetch(`${BASE}/api/chat`, {
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
