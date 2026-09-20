// Talks to the Sumika Chrome extension (backend/../extension) over a
// dedicated WebSocket channel (server.js wires it to path '/ext'). The
// extension is the only thing that can actually reach into the user's real,
// already-open Chrome tabs - a plain web page never can, no matter what
// origin it runs from, so this is the one part of Sumika that must be a
// browser extension rather than more backend code.
let extensionSocket = null;
const pending = new Map();
let nextId = 1;

export function registerExtensionSocket(ws) {
  extensionSocket = ws;
  ws.on('close', () => {
    if (extensionSocket === ws) extensionSocket = null;
    // Any command still waiting on this connection can never get an answer now.
    for (const [id, { reject }] of pending) {
      reject(new Error('Extension disconnected before responding.'));
      pending.delete(id);
    }
  });
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.type !== 'response') return;
    const waiter = pending.get(msg.id);
    if (!waiter) return;
    pending.delete(msg.id);
    if (msg.ok) waiter.resolve(msg.result);
    else waiter.reject(new Error(msg.error || 'Extension command failed.'));
  });
}

export function isExtensionConnected() {
  return Boolean(extensionSocket && extensionSocket.readyState === extensionSocket.OPEN);
}

export function sendCommand(action, payload, timeoutMs = 8000) {
  if (!isExtensionConnected()) {
    return Promise.reject(
      new Error("The Sumika Chrome extension isn't connected - make sure it's installed, enabled, and this backend is running.")
    );
  }
  const id = String(nextId++);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('The extension took too long to respond.'));
    }, timeoutMs);
    pending.set(id, {
      resolve: (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      reject: (err) => {
        clearTimeout(timer);
        reject(err);
      }
    });
    extensionSocket.send(JSON.stringify({ type: 'command', id, action, payload }));
  });
}
