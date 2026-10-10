import { isLocalDev, tokenMatches } from '../auth.js';

// Talks to the Sumika Chrome extension (../../../extension) over a dedicated
// WebSocket channel (server.js routes path '/ext' here). The extension is the
// only thing that can reach into the user's real, already-open Chrome tabs - a
// plain web page never can, whatever origin it runs from.
//
// The extension dials OUT to this server, so it works the same whether the
// backend runs on the user's PC or on Render. Because that makes the endpoint
// public, a connection only becomes "the extension" after it proves it holds
// the access code (or is a local-dev connection from this very machine).
let extensionSocket = null;
const pending = new Map();
let nextId = 1;

const AUTH_DEADLINE_MS = 5000;

export function acceptExtensionConnection(ws, req) {
  let accepted = false;
  const authTimer = setTimeout(() => {
    if (!accepted) ws.close(4401, 'auth timeout');
  }, AUTH_DEADLINE_MS);

  const accept = () => {
    if (accepted) return;
    accepted = true;
    clearTimeout(authTimer);
    if (extensionSocket && extensionSocket !== ws) extensionSocket.close(4000, 'replaced by a newer connection');
    extensionSocket = ws;
    ws.send(JSON.stringify({ type: 'ready' }));
    console.log('[extension] connected');
  };

  ws.on('close', () => {
    clearTimeout(authTimer);
    if (!accepted) return;
    console.log('[extension] disconnected');
    if (extensionSocket === ws) extensionSocket = null;
    // Only commands that went out on THIS socket can never be answered now.
    for (const [id, waiter] of pending) {
      if (waiter.ws !== ws) continue;
      pending.delete(id);
      waiter.reject(new Error('Extension disconnected before responding.'));
    }
  });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!accepted) {
      if (msg.type !== 'auth') return;
      if (tokenMatches(msg.token)) accept();
      else ws.close(4401, 'bad token');
      return;
    }
    if (msg.type === 'ping') {
      ws.send('{"type":"pong"}');
      return;
    }
    if (msg.type !== 'response') return;
    const waiter = pending.get(msg.id);
    if (!waiter) return;
    pending.delete(msg.id);
    if (msg.ok) waiter.resolve(msg.result);
    else waiter.reject(new Error(msg.error || 'Extension command failed.'));
  });

  if (isLocalDev(req)) accept();
}

export function isExtensionConnected() {
  return Boolean(extensionSocket && extensionSocket.readyState === extensionSocket.OPEN);
}

export function sendCommand(action, payload, timeoutMs = 10000) {
  if (!isExtensionConnected()) {
    return Promise.reject(
      new Error(
        "The Sumika Chrome extension isn't connected. It connects while Sumika is open in Chrome - make sure the extension is installed and paired (Browser control, in the Sumika page)."
      )
    );
  }
  const id = String(nextId++);
  const ws = extensionSocket;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('The extension took too long to respond.'));
    }, timeoutMs);
    pending.set(id, {
      ws,
      resolve: (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      reject: (err) => {
        clearTimeout(timer);
        reject(err);
      }
    });
    ws.send(JSON.stringify({ type: 'command', id, action, payload }));
  });
}
