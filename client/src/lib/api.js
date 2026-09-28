const RAW = import.meta.env.VITE_API_BASE_URL || '';
export const API_BASE = RAW.replace(/\/$/, '');

const TOKEN_KEY = 'snapchef_token';
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Cannot reach the server. Check your connection and try again.');
  }

  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }

  if (res.status === 401 && getToken()) {
    clearToken();
    if (!location.pathname.startsWith('/login')) location.href = '/login';
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
