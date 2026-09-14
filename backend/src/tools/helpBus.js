import { EventEmitter } from 'node:events';

// Bridges "I'm stuck, need a human" moments from browser automation to the UI popup.
// server.js listens on 'blocked' to push a WebSocket event to the frontend,
// and calls resolveHelp() when the user clicks "I've handled it" in the popup.
export const helpBus = new EventEmitter();

const pending = new Map();
let nextId = 1;

// `kind: 'blocker'` (default) is a CAPTCHA/login pause; `kind: 'review'` carries
// drafted Q&A for the user to review (and hear read aloud) before submitting.
export function requestHelp({ reason, url, screenshot, kind = 'blocker', qa }) {
  const id = String(nextId++);
  const promise = new Promise((resolve) => {
    pending.set(id, resolve);
  });
  helpBus.emit('blocked', { id, reason, url, screenshot, kind, qa });
  return { id, promise };
}

export function resolveHelp(id) {
  const resolve = pending.get(id);
  if (resolve) {
    resolve();
    pending.delete(id);
    return true;
  }
  return false;
}
