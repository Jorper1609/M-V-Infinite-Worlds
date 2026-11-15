export async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  if (response.status === 204) return null;
  let payload;
  try { payload = await response.json(); } catch { payload = {}; }
  if (!response.ok) {
    const error = new Error(payload.error || `Error HTTP ${response.status}`);
    error.status = response.status;
    error.latest = payload.latest;
    throw error;
  }
  return payload;
}

export const auth = {
  me: () => api('/api/auth/me'),
  login: (login, password) => api('/api/auth/login', { method: 'POST', body: JSON.stringify({ login, password }) }),
  register: (username, email, password) => api('/api/auth/register', { method: 'POST', body: JSON.stringify({ username, email, password }) }),
  logout: () => api('/api/auth/logout', { method: 'POST' })
};

export const saveApi = {
  load: () => api('/api/save'),
  write: (revision, progress) => api('/api/save', { method: 'PUT', body: JSON.stringify({ revision, progress }) })
};
