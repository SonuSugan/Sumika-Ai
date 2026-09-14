// In dev, Vite proxies /api and /ws to the local backend (see vite.config.js),
// so BASE stays empty. In production (Vercel), the frontend and backend are
// separate deployments, so VITE_BACKEND_URL points straight at Render.
const BASE = import.meta.env.VITE_BACKEND_URL || '';

export async function sendMessage(sessionId, message) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  const ws = new WebSocket(wsUrl);
  ws.onmessage = (event) => {
    try {
      onMessage(JSON.parse(event.data));
    } catch {
      // ignore malformed message
    }
  };
  return ws;
}
