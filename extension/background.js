// Sumika Browser Control - service worker.
//
// Holds a WebSocket to the Sumika backend (Render, or a local one) and runs the
// commands it sends - navigate, read, click, type, scroll... - against the
// user's real Chrome tabs. Only an extension can reach into another tab's DOM,
// which is why Sumika needs one at all.
//
// It connects ONLY while a Sumika page is open in Chrome (every command starts
// from that page anyway). That keeps a free-tier cloud backend from being held
// awake around the clock, and means nothing is listening when you're not
// using Sumika.

const FRONTEND_ORIGINS = ['https://sumika-ai-theta.vercel.app', 'http://localhost:5173'];
const FRONTEND_PATTERNS = FRONTEND_ORIGINS.map((origin) => `${origin}/*`);
// A page on a Sumika origin can ask to pair, but only with one of these - a
// compromised page must not be able to point the extension at its own server.
const ALLOWED_BACKENDS = ['https://sumika-backend.onrender.com', 'http://localhost:5175', 'http://127.0.0.1:5175'];

const PING_MS = 20000;
const DEAD_AFTER_MS = 70000;

let ws = null;
let state = 'idle'; // idle | connecting | connected | unauthorized | unreachable
let pingTimer = null;
let lastSeen = 0;
let syncQueue = Promise.resolve();
// Chrome logs every failed connection attempt on the extension's Errors page, so
// while a backend is down retries back off (24s, 48s, ... up to 5 minutes) rather
// than piling up an entry every few seconds.
let failures = 0;
let nextTryAt = 0;
let lastPageCount = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Chrome refuses tab edits for a moment while the user is dragging a tab or
// the tab strip is busy ("Tabs cannot be edited right now"). That passes in a
// second, so retry instead of failing the whole instruction.
async function tabsOp(fn) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= 6 || !/cannot be edited/i.test(err.message)) throw err;
      await sleep(400);
    }
  }
}

async function getConfig() {
  const { sumikaConfig } = await chrome.storage.local.get('sumikaConfig');
  return sumikaConfig || null;
}

const isSumikaPage = (tab) => FRONTEND_ORIGINS.some((origin) => (tab?.url || '').startsWith(`${origin}/`) || tab?.url === origin);

// ---- connection ------------------------------------------------------------

function closeSocket() {
  clearInterval(pingTimer);
  if (!ws) return;
  const socket = ws;
  ws = null;
  socket.onclose = null;
  try {
    socket.close();
  } catch {
    // already closed
  }
}

function openSocket(config) {
  state = 'connecting';
  let socket;
  try {
    socket = new WebSocket(`${config.backendUrl.replace(/^http/, 'ws')}/ext`);
  } catch {
    state = 'unreachable';
    return;
  }
  ws = socket;
  lastSeen = Date.now();

  socket.onopen = () => {
    lastSeen = Date.now();
    if (config.token) socket.send(JSON.stringify({ type: 'auth', token: config.token }));
    clearInterval(pingTimer);
    // Steady traffic both keeps Render's proxy from idling the socket out and
    // (Chrome 116+) keeps this service worker alive while it's connected.
    pingTimer = setInterval(() => {
      if (socket.readyState !== WebSocket.OPEN) return;
      if (Date.now() - lastSeen > DEAD_AFTER_MS) {
        socket.close();
        return;
      }
      socket.send('{"type":"ping"}');
    }, PING_MS);
  };

  socket.onmessage = (event) => {
    lastSeen = Date.now();
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    if (msg.type === 'ready') {
      state = 'connected';
      failures = 0;
      nextTryAt = 0;
    } else if (msg.type === 'command') handleCommand(msg, socket);
  };

  socket.onclose = (event) => {
    if (ws !== socket) return;
    ws = null;
    clearInterval(pingTimer);
    state = event.code === 4401 ? 'unauthorized' : 'unreachable';
    if (state === 'unreachable') {
      failures += 1;
      nextTryAt = Date.now() + Math.min(24000 * 2 ** (failures - 1), 300000);
    }
  };

  socket.onerror = () => {
    // onclose follows and records the state.
  };
}

async function doSync(force) {
  const config = await getConfig();
  const pages = (await chrome.tabs.query({ url: FRONTEND_PATTERNS })).length;
  // A newly opened Sumika page is the user asking for it to work now.
  if (pages > lastPageCount) {
    failures = 0;
    nextTryAt = 0;
  }
  lastPageCount = pages;
  if (!config || pages === 0) {
    closeSocket();
    state = 'idle';
    return;
  }
  if (force) {
    closeSocket();
    state = 'idle';
    failures = 0;
    nextTryAt = 0;
  }
  if (state === 'unauthorized') return; // wrong code - retrying can't fix it, re-pairing does
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  if (Date.now() < nextTryAt) return;
  openSocket(config);
}

// Serialized so the alarm, tab events and page messages can't race each other
// into opening two sockets.
function syncConnection(force = false) {
  syncQueue = syncQueue.then(() => doSync(force)).catch(() => {});
  return syncQueue;
}

let syncTimer = null;
function scheduleSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncConnection(), 400);
}

async function ensureAlarm() {
  if (!(await chrome.alarms.get('sumika-sync'))) chrome.alarms.create('sumika-sync', { periodInMinutes: 0.4 });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'sumika-sync') syncConnection();
});
chrome.runtime.onInstalled.addListener(() => {
  ensureAlarm();
  syncConnection();
});
chrome.runtime.onStartup.addListener(() => {
  ensureAlarm();
  syncConnection();
});
chrome.tabs.onCreated.addListener(scheduleSync);
chrome.tabs.onRemoved.addListener(scheduleSync);
chrome.tabs.onUpdated.addListener((_id, info, tab) => {
  // Reloading the Sumika page also counts as "try again now".
  if (info.status === 'loading' && isSumikaPage(tab)) nextTryAt = 0;
  if (info.url || info.status === 'complete') scheduleSync();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.sumikaConfig) syncConnection(true);
});

ensureAlarm();
syncConnection();

// ---- pairing / status (from the Sumika page via content.js, or the popup) ---

async function status() {
  await syncConnection();
  const config = await getConfig();
  return { ok: true, configured: Boolean(config), backendUrl: config?.backendUrl || null, state };
}

async function pair({ backendUrl, token }) {
  const url = String(backendUrl || '').replace(/\/+$/, '');
  if (!ALLOWED_BACKENDS.includes(url)) return { ok: false, error: 'That backend is not allowed.' };
  const next = { backendUrl: url, token: String(token || '') };
  const prev = await getConfig();
  // The page re-pairs on every load - don't bounce a healthy connection for that.
  if (!prev || prev.backendUrl !== next.backendUrl || prev.token !== next.token) {
    await chrome.storage.local.set({ sumikaConfig: next });
    await syncConnection(true);
  }
  return status();
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  let origin = '';
  try {
    origin = new URL(sender.url || '').origin;
  } catch {
    // no usable sender url
  }
  const fromPage = Boolean(sender.tab) && FRONTEND_ORIGINS.includes(origin);
  const fromPopup = !sender.tab && sender.id === chrome.runtime.id;
  if (!fromPage && !fromPopup) return false;

  const failed = () => sendResponse({ ok: false, error: 'The extension hit an error - try again.' });
  if (msg.type === 'status') {
    status().then(sendResponse, failed);
  } else if (msg.type === 'pair' && fromPage) {
    pair(msg).then(sendResponse, failed);
  } else if (msg.type === 'unpair') {
    chrome.storage.local.remove('sumikaConfig').then(() => syncConnection(true)).then(status).then(sendResponse, failed);
  } else {
    return false;
  }
  return true;
});

// ---- which tab we work on --------------------------------------------------

async function getTracked() {
  const { trackedTab } = await chrome.storage.session.get('trackedTab');
  if (trackedTab != null) {
    try {
      const tab = await chrome.tabs.get(trackedTab);
      if (!isSumikaPage(tab)) return tab;
    } catch {
      // tab was closed
    }
    await chrome.storage.session.remove('trackedTab');
  }
  return null;
}

const track = (tab) => chrome.storage.session.set({ trackedTab: tab.id });

// Never the Sumika page itself: the user is talking to it, so it is usually
// the active tab - and scrolling or navigating it away would wreck the very
// thing they're using. "The current page" means the other page they were on.
async function getTargetTab({ create = false } = {}) {
  const tracked = await getTracked();
  if (tracked) return tracked;

  if (!create) {
    const candidates = (await chrome.tabs.query({})).filter((tab) => !isSumikaPage(tab) && /^https?:/.test(tab.url || ''));
    candidates.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
    if (!candidates[0]) return null;
    await track(candidates[0]);
    return candidates[0];
  }

  const created = await tabsOp(() => chrome.tabs.create({ url: 'about:blank' }));
  await track(created);
  return created;
}

async function requireTab() {
  const tab = await getTargetTab();
  if (!tab) throw new Error('There is no other page open to work on. Ask me to open one first.');
  return tab;
}

async function bringForward(tab) {
  await tabsOp(() => chrome.tabs.update(tab.id, { active: true }));
  try {
    await chrome.windows.update(tab.windowId, { focused: true });
  } catch {
    // window state can't be changed right now - the tab is still active in it
  }
}

// Registers the load listener BEFORE doing the navigation, otherwise a fast
// page can finish loading before we start listening. If nothing starts loading
// (same-page hash change, no-op), don't sit out the full timeout.
async function navigateAndWait(tabId, action, noNavigationMs = 4000) {
  let finish;
  const loaded = new Promise((resolve) => (finish = resolve));
  let sawLoading = false;
  const listener = (id, info) => {
    if (id !== tabId) return;
    if (info.status === 'loading') sawLoading = true;
    if (info.status === 'complete' && sawLoading) finish();
  };
  const hardLimit = setTimeout(finish, 20000);
  const noNavigation = setTimeout(() => {
    if (!sawLoading) finish();
  }, noNavigationMs);
  chrome.tabs.onUpdated.addListener(listener);
  try {
    await action();
    await loaded;
  } finally {
    clearTimeout(hardLimit);
    clearTimeout(noNavigation);
    chrome.tabs.onUpdated.removeListener(listener);
  }
  await sleep(500); // let a single-page app render something
}

// After a click/Enter the page may or may not navigate - give it a moment to
// start, then wait out any load that began.
async function settle(tabId) {
  await sleep(600);
  for (let i = 0; i < 40; i += 1) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab || tab.status !== 'loading') break;
    await sleep(250);
  }
  await sleep(300);
}

// ---- in-page actions -------------------------------------------------------

// Injected into the page, so it must be completely self-contained (no closures
// over anything in this file). One function for every in-page action so the
// helpers - labelling, visibility, the safety checks - exist exactly once.
function pageAction(action, a) {
  const FINAL = /\b(submit|apply now|pay|buy|purchase|checkout|confirm order|place order|delete account)\b/i;
  const SENSITIVE = /(card.?num|cc.?num|cc-|cvv|cvc|security.?code|one.?time|otp|ssn|social.?security|passport|aadhaar|pan.?num)/i;
  const SELECTOR = [
    'a[href]', 'button', 'input:not([type=hidden])', 'select', 'textarea', 'summary',
    '[role=button]', '[role=link]', '[role=tab]', '[role=menuitem]', '[role=checkbox]', '[role=radio]',
    '[role=switch]', '[role=option]', '[onclick]', '[contenteditable=""]', '[contenteditable=true]'
  ].join(',');

  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const style = getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none';
  };

  const labelOf = (el) => {
    const aria = clean(el.getAttribute('aria-label'));
    if (aria) return aria;
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const t = clean(by.split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' '));
      if (t) return t;
    }
    if (el.labels?.length) {
      const t = clean(Array.from(el.labels).map((l) => l.textContent).join(' '));
      if (t) return t;
    }
    const tag = el.tagName;
    if (tag === 'INPUT') {
      const t = (el.type || '').toLowerCase();
      if (t === 'submit' || t === 'button' || t === 'reset') return clean(el.value);
      return clean(el.placeholder || el.title || el.name);
    }
    if (tag === 'TEXTAREA' || tag === 'SELECT') return clean(el.placeholder || el.title || el.name);
    return clean(el.innerText || el.textContent || el.title) || clean(el.querySelector('img[alt]')?.alt);
  };

  const kindOf = (el) => {
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role');
    if (tag === 'a') return 'link';
    if (tag === 'button' || role === 'button') return 'button';
    if (tag === 'select') return 'dropdown';
    if (tag === 'textarea') return 'textarea';
    if (tag === 'input') return `input:${(el.type || 'text').toLowerCase()}`;
    if (role) return role;
    if (el.isContentEditable) return 'editable';
    return tag;
  };

  const byRef = (n) => document.querySelector(`[data-sumika-ref="${Number(n)}"]`);
  const interactive = () => Array.from(document.querySelectorAll(SELECTOR)).filter(visible);

  // Exact label beats "starts with" beats "contains"; ties go to the shorter label.
  const bestMatch = (text, pool) => {
    const want = clean(text).toLowerCase();
    if (!want) return null;
    const scored = [];
    for (const el of pool) {
      const hay = [labelOf(el), el.getAttribute('name'), el.id, el.getAttribute('placeholder'), el.getAttribute('title')]
        .map((s) => clean(s).toLowerCase())
        .filter(Boolean);
      let score = 0;
      if (hay.some((h) => h === want)) score = 3;
      else if (hay.some((h) => h.startsWith(want))) score = 2;
      else if (hay.some((h) => h.includes(want))) score = 1;
      if (score) scored.push({ el, score, len: hay[0]?.length || 999 });
    }
    scored.sort((x, y) => y.score - x.score || x.len - y.len);
    return scored[0]?.el || null;
  };

  const findField = (ref, label, wantSelect) => {
    if (ref != null) return byRef(ref);
    const pool = interactive().filter((el) => (wantSelect ? el.tagName === 'SELECT' : /^(INPUT|TEXTAREA)$/.test(el.tagName) || el.isContentEditable));
    return bestMatch(label, pool);
  };

  const flash = (el) => {
    const old = el.style.outline;
    el.style.outline = '3px solid #5be6ff';
    setTimeout(() => {
      el.style.outline = old;
    }, 700);
  };

  const gone = (ref) => `Element [${ref}] isn't on the page any more - it changed. Read the page again.`;

  if (action === 'read') {
    document.querySelectorAll('[data-sumika-ref]').forEach((el) => el.removeAttribute('data-sumika-ref'));
    const elements = interactive().slice(0, 80).map((el, i) => {
      const n = i + 1;
      el.setAttribute('data-sumika-ref', String(n));
      let line = `[${n}] ${kindOf(el)} "${labelOf(el).slice(0, 70)}"`;
      const tag = el.tagName;
      if (tag === 'A') {
        try {
          const u = new URL(el.href);
          line += ` -> ${(u.origin === location.origin ? u.pathname + u.search : u.host).slice(0, 60)}`;
        } catch {
          // unparsable href
        }
      }
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        const t = (el.type || '').toLowerCase();
        if (t === 'checkbox' || t === 'radio') line += el.checked ? ' [checked]' : ' [unchecked]';
        else if (t !== 'password' && el.value) line += ` value="${clean(el.value).slice(0, 40)}"`;
        if (el.required) line += ' (required)';
      }
      if (tag === 'SELECT') {
        const opts = Array.from(el.options).slice(0, 8).map((o) => clean(o.text));
        line += ` value="${clean(el.selectedOptions[0]?.text)}" options: ${opts.join(' | ')}${el.options.length > 8 ? ' | ...' : ''}`;
      }
      if (el.disabled) line += ' (disabled)';
      return line;
    });
    const root = document.scrollingElement || document.documentElement;
    const max = Math.max(root.scrollHeight - root.clientHeight, 0);
    return {
      title: document.title,
      url: location.href,
      text: (document.body?.innerText || '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 2500),
      elements,
      position: max ? `${Math.round((root.scrollTop / max) * 100)}% down the page` : 'the page fits on one screen'
    };
  }

  if (action === 'scroll') {
    const px = { small: 300, normal: 600, large: 1200 }[a.amount] || 600;
    const dir = a.direction || 'down';
    const root = document.scrollingElement || document.documentElement;
    let scroller = root;
    // Many apps scroll an inner container, leaving the window itself unscrollable.
    if (root.scrollHeight <= root.clientHeight + 4) {
      let best = null;
      let bestArea = 0;
      for (const el of document.querySelectorAll('*')) {
        if (el.scrollHeight <= el.clientHeight + 4) continue;
        const overflowY = getComputedStyle(el).overflowY;
        if (overflowY !== 'auto' && overflowY !== 'scroll') continue;
        const r = el.getBoundingClientRect();
        const area = Math.max(r.width, 0) * Math.max(Math.min(r.bottom, innerHeight) - Math.max(r.top, 0), 0);
        if (area > bestArea) {
          best = el;
          bestArea = area;
        }
      }
      if (best) scroller = best;
    }
    const before = scroller.scrollTop;
    const max = Math.max(scroller.scrollHeight - scroller.clientHeight, 0);
    let target = dir === 'top' ? 0 : dir === 'bottom' ? max : dir === 'up' ? before - px : before + px;
    target = Math.min(Math.max(target, 0), max);
    scroller.scrollTo({ top: target, behavior: 'instant' });
    const after = scroller.scrollTop;
    return { scrolled: Math.abs(after - before) > 1, position: max ? `${Math.round((after / max) * 100)}% of the way down` : 'at the top' };
  }

  if (action === 'click') {
    let el = a.ref != null ? byRef(a.ref) : bestMatch(a.text, interactive());
    if (!el && a.ref == null) {
      // Nothing interactive by that name - a clickable div, or text inside one.
      const leaves = Array.from(document.querySelectorAll('body *')).filter((e) => e.children.length === 0 && visible(e));
      const hit = bestMatch(a.text, leaves);
      el = hit?.closest(SELECTOR) || hit;
    }
    if (!el) return { found: false, error: a.ref != null ? gone(a.ref) : undefined };
    const label = labelOf(el);
    if (FINAL.test(label)) return { found: true, blocked: true, matchedText: label.slice(0, 60) };
    el.scrollIntoView({ block: 'center', inline: 'center' });
    flash(el);
    el.click();
    return { found: true, matchedText: label.slice(0, 60) };
  }

  if (action === 'type') {
    const el = findField(a.ref, a.label, false);
    if (!el) return { found: false, error: a.ref != null ? gone(a.ref) : undefined };
    const tag = el.tagName;
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    const textual = tag === 'TEXTAREA' || (tag === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'file', 'image', 'reset', 'range', 'color'].includes(type));
    if (!textual && !el.isContentEditable) return { found: false, error: "That element isn't a text field - use click for checkboxes, buttons and the like." };
    const fieldLabel = labelOf(el).slice(0, 60);
    const ac = (el.getAttribute('autocomplete') || '').toLowerCase();
    if (type === 'password' || ac.startsWith('cc-') || ac === 'one-time-code' || SENSITIVE.test([el.name, el.id, fieldLabel, ac].join(' '))) {
      return { found: true, blocked: 'password, card or ID field', fieldLabel };
    }

    el.scrollIntoView({ block: 'center' });
    el.focus();
    const keep = a.clear === false;
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      const proto = tag === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      // The native setter, not el.value = ..., or React-style inputs ignore the change.
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, (keep ? el.value : '') + a.text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      el.textContent = (keep ? el.textContent : '') + a.text;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: a.text }));
    }
    flash(el);

    let submitted;
    if (a.submit) {
      const form = el.form;
      const button = form?.querySelector('[type=submit]');
      const risky = form && (form.querySelector('input[type=password]') || FINAL.test(clean(button?.innerText || button?.value)));
      if (risky) {
        submitted = false;
      } else if (form) {
        form.requestSubmit();
        submitted = true;
      } else {
        for (const t of ['keydown', 'keypress', 'keyup']) {
          el.dispatchEvent(new KeyboardEvent(t, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        }
        submitted = true;
      }
    }
    return { found: true, fieldLabel, submitted };
  }

  if (action === 'select') {
    const el = findField(a.ref, a.label, true);
    if (!el) return { found: false, error: a.ref != null ? gone(a.ref) : undefined };
    if (el.tagName !== 'SELECT') return { found: false, error: "That isn't a dropdown - click it and click the option instead." };
    const want = clean(a.option).toLowerCase();
    const options = Array.from(el.options);
    const hit =
      options.find((o) => clean(o.text).toLowerCase() === want || o.value.toLowerCase() === want) ||
      options.find((o) => clean(o.text).toLowerCase().includes(want));
    const fieldLabel = labelOf(el).slice(0, 60);
    if (!hit) return { found: true, chosen: null, options: options.slice(0, 15).map((o) => clean(o.text)), fieldLabel };
    el.value = hit.value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    flash(el);
    return { found: true, chosen: clean(hit.text), fieldLabel };
  }

  return { error: `Unknown page action: ${action}` };
}

async function runInPage(tab, action, payload) {
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: pageAction,
      args: [action, payload]
    });
    return injection?.result ?? {};
  } catch (err) {
    if (/cannot access|extensions gallery|chrome:\/\//i.test(err.message)) {
      throw new Error("I can't work on that kind of page - browser-internal and store pages are off limits to extensions.");
    }
    throw err;
  }
}

// ---- commands from the backend ---------------------------------------------

async function runCommand(action, p) {
  if (action === 'reload') {
    // Lets a development session pick up edited extension files without
    // anyone clicking reload on chrome://extensions. Only the authenticated
    // backend can send it, and all it does is restart this extension.
    setTimeout(() => chrome.runtime.reload(), 200);
    return { reloading: true };
  }

  if (action === 'navigate') {
    const tab = await getTargetTab({ create: true });
    await bringForward(tab);
    await navigateAndWait(tab.id, () => tabsOp(() => chrome.tabs.update(tab.id, { url: p.url })));
    const now = await chrome.tabs.get(tab.id);
    return { url: now.url, title: now.title };
  }

  if (action === 'history') {
    const tab = await requireTab();
    await bringForward(tab);
    if (p.direction === 'reload') {
      await navigateAndWait(tab.id, () => tabsOp(() => chrome.tabs.reload(tab.id)));
    } else {
      // history.go() inside the page, not chrome.tabs.goBack: a link we clicked
      // had no real user gesture behind it, and Chrome then leaves the
      // back/forward API with "no page in history" even though the page's own
      // history has the entry.
      const before = (await chrome.tabs.get(tab.id)).url;
      await navigateAndWait(
        tab.id,
        async () => {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: (delta) => history.go(delta),
              args: [p.direction === 'back' ? -1 : 1]
            });
          } catch {
            // the page unloading under the script is the normal outcome
          }
        },
        2500
      );
      if ((await chrome.tabs.get(tab.id)).url === before) throw new Error(`There's no page to go ${p.direction} to.`);
    }
    const now = await chrome.tabs.get(tab.id);
    return { url: now.url, title: now.title };
  }

  if (action === 'tabs') {
    const others = async () => (await chrome.tabs.query({})).filter((t) => !isSumikaPage(t) && /^https?:/.test(t.url || ''));
    if (p.action === 'list') {
      const tracked = await getTracked();
      const tabs = (await others()).slice(0, 20).map((t) => ({ id: t.id, title: t.title, url: t.url, current: t.id === tracked?.id }));
      return { tabs };
    }
    if (p.action === 'switch') {
      const want = String(p.match || '').toLowerCase();
      const tab = (await others()).find((t) => (p.tabId != null ? t.id === p.tabId : want && `${t.title} ${t.url}`.toLowerCase().includes(want)));
      if (!tab) return { error: 'No open tab matches that. Try listing the tabs first.' };
      await track(tab);
      await bringForward(tab);
      return { message: `Switched to "${tab.title}" (${tab.url}).` };
    }
    if (p.action === 'new') {
      const tab = await tabsOp(() => chrome.tabs.create({ url: 'about:blank' }));
      await track(tab);
      await bringForward(tab);
      await navigateAndWait(tab.id, () => tabsOp(() => chrome.tabs.update(tab.id, { url: p.url })));
      const now = await chrome.tabs.get(tab.id);
      return { message: `Opened a new tab on ${now.url} ("${now.title}") and switched to it.` };
    }
    if (p.action === 'close') {
      const tab = p.tabId != null ? (await others()).find((t) => t.id === p.tabId) : await getTracked();
      if (!tab) return { error: "I can't tell which tab to close - give me its id from the tab list." };
      await tabsOp(() => chrome.tabs.remove(tab.id));
      return { message: `Closed "${tab.title}".` };
    }
    return { error: `Unknown tab action: ${p.action}` };
  }

  const tab = await requireTab();

  if (action === 'read') {
    return runInPage(tab, 'read', {});
  }

  await bringForward(tab);

  if (action === 'scroll') {
    return runInPage(tab, 'scroll', p);
  }

  if (action === 'click' || action === 'type' || action === 'select') {
    const before = tab.url;
    const result = await runInPage(tab, action, p);
    const acted = result.found && !result.blocked && result.error === undefined && result.chosen !== null;
    if (acted && (action === 'click' || (action === 'type' && p.submit))) await settle(tab.id);
    const now = await chrome.tabs.get(tab.id).catch(() => tab);
    return { ...result, url: now.url, navigated: now.url !== before };
  }

  throw new Error(`Unknown action: ${action}`);
}

async function handleCommand(msg, socket) {
  const respond = (ok, result, error) => {
    try {
      socket.send(JSON.stringify({ type: 'response', id: msg.id, ok, result, error }));
    } catch {
      // socket closed while we were working - the backend already gave up on it
    }
  };
  try {
    respond(true, await runCommand(msg.action, msg.payload || {}));
  } catch (err) {
    respond(false, null, err.message);
  }
}
