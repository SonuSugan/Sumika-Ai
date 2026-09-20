// Connects to Sumika's local backend and executes the navigate/scroll/click/
// read commands it sends against the user's real Chrome tabs. This is the
// piece that a plain web page could never be: only an extension can reach
// into another tab's DOM (with the user's explicit permission grant on
// install), which is exactly why Sumika needs one at all.

const BACKEND_WS_URL = 'ws://localhost:5175/ext';

let ws = null;
let sumikaTabId = null;

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  ws = new WebSocket(BACKEND_WS_URL);
  ws.onmessage = (event) => handleCommand(JSON.parse(event.data));
  ws.onclose = () => {
    ws = null;
  };
  ws.onerror = () => {
    try { ws.close(); } catch { /* already closing */ }
  };
}

// MV3 service workers get killed when idle - this periodically wakes this one
// back up and reconnects if the socket dropped, instead of silently staying
// disconnected until the next unrelated event happens to revive it.
chrome.alarms.create('sumika-reconnect', { periodInMinutes: 0.4 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'sumika-reconnect') connect();
});
chrome.runtime.onInstalled.addListener(connect);
chrome.runtime.onStartup.addListener(connect);
connect();

async function getTargetTab() {
  if (sumikaTabId !== null) {
    try {
      return await chrome.tabs.get(sumikaTabId);
    } catch {
      sumikaTabId = null;
    }
  }
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (active) {
    sumikaTabId = active.id;
    return active;
  }
  const created = await chrome.tabs.create({ url: 'about:blank' });
  sumikaTabId = created.id;
  return created;
}

function waitForLoad(tabId) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 12000);
    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// Runs inside the target page - must be fully self-contained (no closures
// over background.js variables), since chrome.scripting injects it fresh.
function pageScrollBy(dy) {
  window.scrollBy({ top: dy, behavior: 'smooth' });
}

function pageClickByText(text) {
  const target = String(text).trim().toLowerCase();
  const isVisible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const style = getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none';
  };
  const label = (el) =>
    (el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim().toLowerCase();

  const clickable = Array.from(
    document.querySelectorAll('a, button, [role="button"], input[type="submit"], input[type="button"], summary, [onclick], [tabindex]')
  );
  let best = clickable.find((el) => isVisible(el) && label(el) && label(el).includes(target));

  if (!best) {
    // Nothing clickable named that - fall back to any small visible leaf
    // element containing the text, then click its nearest clickable ancestor.
    const leaves = Array.from(document.querySelectorAll('body *')).filter((el) => el.children.length === 0);
    const match = leaves.find((el) => isVisible(el) && label(el).includes(target));
    best = match?.closest('a, button, [role="button"], [onclick]') || match;
  }

  if (!best) return { found: false };
  best.scrollIntoView({ block: 'center', behavior: 'instant' });
  best.click();
  return { found: true, matchedText: label(best).slice(0, 80) };
}

function pageRead() {
  return {
    title: document.title,
    text: (document.body?.innerText || '').trim().slice(0, 1200)
  };
}

async function handleCommand(msg) {
  if (msg.type !== 'command') return;
  const respond = (ok, result, error) => {
    ws?.send(JSON.stringify({ type: 'response', id: msg.id, ok, result, error }));
  };

  try {
    if (msg.action === 'navigate') {
      const tab = await getTargetTab();
      await chrome.tabs.update(tab.id, { url: msg.payload.url, active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
      await waitForLoad(tab.id);
      const updated = await chrome.tabs.get(tab.id);
      respond(true, { url: updated.url });
      return;
    }

    const tab = await getTargetTab();
    await chrome.windows.update(tab.windowId, { focused: true });
    await chrome.tabs.update(tab.id, { active: true });

    if (msg.action === 'scroll') {
      const px = { small: 300, normal: 600, large: 1200 }[msg.payload.amount] || 600;
      const dy = msg.payload.direction === 'up' ? -px : px;
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: pageScrollBy, args: [dy] });
      respond(true, { url: tab.url });
    } else if (msg.action === 'click') {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: pageClickByText,
        args: [msg.payload.text]
      });
      respond(true, { ...result, url: tab.url });
    } else if (msg.action === 'read') {
      const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: pageRead });
      respond(true, { ...result, url: tab.url });
    } else {
      respond(false, null, `Unknown action: ${msg.action}`);
    }
  } catch (err) {
    respond(false, null, err.message);
  }
}
