// In dev, Vite proxies /api and /ws to the local backend (see vite.config.js),
// so BASE stays empty. In production (Vercel), the frontend and backend are
// separate deployments, so VITE_BACKEND_URL points straight at Render.
const BASE = import.meta.env.VITE_BACKEND_URL || '';

// The access code unlocks browser control on a deployed backend (a local one
// trusts this machine and needs none). It lives in this browser only.
const ACCESS_KEY = 'sumika.accessCode';

export function getAccessCode() {
  try {
    return localStorage.getItem(ACCESS_KEY) || '';
  } catch {
    return '';
  }
}

export function setAccessCode(code) {
  try {
    if (code) localStorage.setItem(ACCESS_KEY, code);
    else localStorage.removeItem(ACCESS_KEY);
  } catch {
    // storage blocked - the code just won't persist across reloads
  }
}

// Where the extension should dial: the same backend this page's API calls use.
export const backendUrl = () => BASE || 'http://localhost:5175';

export async function checkAccess(code) {
  const res = await fetch(`${BASE}/api/access`, { headers: code ? { 'X-Sumika-Token': code } : {} });
  const data = await res.json().catch(() => ({}));
  return Boolean(data.trusted);
}

export async function sendMessage(sessionId, message) {
  const code = getAccessCode();
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(code ? { 'X-Sumika-Token': code } : {}) },
    body: JSON.stringify({ sessionId, message })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export function resumeHelp(id) {
  return fetch(`${BASE}/api/resume-help`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  });
}

export async function getProfile() {
  const res = await fetch(`${BASE}/api/profile`);
  if (!res.ok) throw new Error('Failed to load profile');
  return res.json();
}

export async function uploadResume(file) {
  const form = new FormData();
  form.append('resume', file);
  const res = await fetch(`${BASE}/api/profile/resume`, { method: 'POST', body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Upload failed');
  }
  return res.json();
}

export function connectSocket(onMessage) {
  const wsUrl = BASE
    ? `${BASE.replace(/^http/, 'ws')}/ws`
    : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;
  // The free backend host goes to sleep and restarts, which drops this socket;
  // without reconnecting, live progress and help popups silently stop until
  // the page is reloaded.
  let ws;
  let closed = false;
  let retry = null;

  const open = () => {
    ws = new WebSocket(wsUrl);
    ws.onmessage = (event) => {
      try {
        onMessage(JSON.parse(event.data));
      } catch {
        // ignore malformed message
      }
    };
    ws.onclose = () => {
      if (!closed) retry = setTimeout(open, 3000);
    };
  };
  open();

  return {
    close() {
      closed = true;
      clearTimeout(retry);
      ws.close();
    }
  };
}
