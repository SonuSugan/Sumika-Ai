// Runs only on the Sumika pages (see manifest matches). It is the one-way door
// between the Sumika page and this extension: the page asks to pair/check
// status with window.postMessage, and this relays it to the background worker.
// The worker re-checks the sender's origin itself, so this is convenience, not
// the security boundary.
function reply(type, payload = {}) {
  window.postMessage({ source: 'sumika-extension', type, ...payload }, location.origin);
}

window.addEventListener('message', async (event) => {
  if (event.source !== window || event.origin !== location.origin) return;
  const msg = event.data;
  if (!msg || msg.source !== 'sumika-page') return;

  try {
    if (msg.type === 'hello' || msg.type === 'status') {
      reply('status', await chrome.runtime.sendMessage({ type: 'status' }));
    } else if (msg.type === 'pair') {
      reply('status', await chrome.runtime.sendMessage({ type: 'pair', backendUrl: msg.backendUrl, token: msg.token }));
    } else if (msg.type === 'unpair') {
      reply('status', await chrome.runtime.sendMessage({ type: 'unpair' }));
    }
  } catch {
    // The worker can be mid-restart; the page simply asks again on its next poll.
  }
});

reply('ready');
