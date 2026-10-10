import { sendCommand } from './extensionBridge.js';
import { resolveUrl } from './system.js';

// Drives the user's REAL, already-open Chrome via the Sumika extension - not a
// separate Playwright window like browse_job_site/apply_to_job use. A plain web
// app can never reach another tab's DOM across origins, so this is the one part
// of Sumika that has to be an actual browser extension; sendCommand() talks to
// it over the /ext WebSocket wired up in server.js.

// Sumika navigates, fills in and reads; the human commits to anything final.
// The extension enforces this again on the label of the element it actually
// finds, since the words the user said can differ from what the button says.
const FINAL_ACTION = /\b(submit|apply now|pay|buy|purchase|checkout|confirm order|place order|delete account)\b/i;

const MAX_MESSAGE = 5500;
const clip = (text) => (text.length > MAX_MESSAGE ? `${text.slice(0, MAX_MESSAGE)}\n...(cut)` : text);

// What a person sees the moment a page appears. Every step costs a whole model
// call, and free-tier models cap tokens per minute, so anything that lands on
// a new page hands back its contents right away instead of needing a separate
// "read" step.
function describePage(r, { text = 1500, elements = 50 } = {}) {
  const shown = r.elements.slice(0, elements);
  const more = r.elements.length > shown.length ? `\n...and ${r.elements.length - shown.length} more (scroll, or read the page again)` : '';
  return clip(
    [
      `Page: "${r.title}" - ${r.url}`,
      `Scroll: ${r.position}`,
      `Visible text:\n${r.text.slice(0, text) || '(none)'}`,
      `Interactive elements (use the [number] with click/type/select):\n${shown.join('\n') || '(none found)'}${more}`
    ].join('\n\n')
  );
}

async function withPage(message) {
  try {
    return `${message}\n\n${describePage(await sendCommand('read', {}, 15000))}`;
  } catch {
    return message;
  }
}

export async function openInBrowser({ url }) {
  // chrome.tabs.update resolves a scheme-less string relative to the
  // extension's OWN origin (chrome-extension://...) rather than as a web
  // address, so this must always hand it a full, resolved URL.
  const r = await sendCommand('navigate', { url: resolveUrl(url) }, 25000);
  return { ok: true, message: await withPage(`Opened ${r.url}.`) };
}

export async function browserHistory({ direction = 'back' }) {
  if (!['back', 'forward', 'reload'].includes(direction)) {
    return { ok: false, message: 'direction must be back, forward or reload.' };
  }
  const r = await sendCommand('history', { direction }, 25000);
  return { ok: true, message: await withPage(`Went ${direction}; now on ${r.url}.`) };
}

export async function scrollInBrowser({ direction = 'down', amount = 'normal' }) {
  const r = await sendCommand('scroll', { direction, amount });
  if (!r.scrolled) return { ok: false, message: `Couldn't scroll ${direction} - already at the ${direction === 'up' || direction === 'top' ? 'top' : 'bottom'}.` };
  return { ok: true, message: `Scrolled ${direction}; now ${r.position}.` };
}

export async function clickInBrowser({ ref, text }) {
  if (ref == null && !text) return { ok: false, message: 'Say which element to click: a [number] from read_browser_page, or its visible text.' };
  if (ref == null && FINAL_ACTION.test(String(text))) {
    return { ok: false, message: `I won't click "${text}" - that looks like a final/irreversible action. Please click that one yourself.` };
  }
  const r = await sendCommand('click', { ref, text });
  if (r.blocked) return { ok: false, message: `I won't click "${r.matchedText}" - that looks like a final/irreversible action. Please click that one yourself.` };
  if (!r.found) return { ok: false, message: r.error || `I don't see anything matching "${text ?? ref}" on the page. Try read_browser_page to see what's there.` };
  const clicked = `Clicked ${r.matchedText ? `"${r.matchedText}"` : `[${ref}]`}.`;
  if (r.navigated) return { ok: true, message: await withPage(`${clicked} It went to ${r.url}.`) };
  return { ok: true, message: `${clicked} Still on ${r.url}.` };
}

export async function typeInBrowser({ ref, label, text, clear = true, submit = false }) {
  if (ref == null && !label) return { ok: false, message: 'Say which field: a [number] from read_browser_page, or its label.' };
  const r = await sendCommand('type', { ref, label, text: String(text ?? ''), clear, submit });
  if (r.blocked) return { ok: false, message: `I won't type into that field (${r.blocked}). Please enter that one yourself.` };
  if (!r.found) return { ok: false, message: r.error || `I can't find a field matching "${label ?? ref}". Try read_browser_page.` };
  const field = r.fieldLabel ? `"${r.fieldLabel}"` : `[${ref}]`;
  if (submit && r.submitted === false) {
    return { ok: true, message: `Typed into ${field}, but did NOT press enter: that form looks like a login or checkout, so submitting it is the user's to do.` };
  }
  const typed = `Typed into ${field}${submit ? ' and pressed enter' : ''}.`;
  if (r.navigated) return { ok: true, message: await withPage(`${typed} It went to ${r.url}.`) };
  return { ok: true, message: typed };
}

export async function selectInBrowser({ ref, label, option }) {
  if ((ref == null && !label) || !option) return { ok: false, message: 'Need the dropdown ([number] or label) and the option to choose.' };
  const r = await sendCommand('select', { ref, label, option: String(option) });
  if (!r.found) return { ok: false, message: r.error || `I can't find a dropdown matching "${label ?? ref}".` };
  if (!r.chosen) return { ok: false, message: `That dropdown has no option matching "${option}". Options: ${(r.options || []).join(', ')}` };
  return { ok: true, message: `Selected "${r.chosen}" in ${r.fieldLabel ? `"${r.fieldLabel}"` : `[${ref}]`}.` };
}

export async function readBrowserPage() {
  const r = await sendCommand('read', {}, 15000);
  return { ok: true, message: describePage(r, { text: 2500, elements: 80 }) };
}

export async function browserTabs({ action = 'list', tabId, match, url }) {
  if (action === 'new' && url) url = resolveUrl(url);
  const r = await sendCommand('tabs', { action, tabId, match, url }, 25000);
  if (r.error) return { ok: false, message: r.error };
  if (action === 'list') {
    return { ok: true, message: r.tabs.length ? r.tabs.map((t) => `[tab ${t.id}] "${t.title}" - ${t.url}${t.current ? ' (current)' : ''}`).join('\n') : 'No other tabs are open.' };
  }
  // After closing there is no page of ours to show - and reading would land on one of their other tabs.
  return { ok: true, message: action === 'close' ? r.message : await withPage(r.message) };
}

export async function waitInBrowser({ seconds = 2 }) {
  const s = Math.min(Math.max(Number(seconds) || 2, 0.5), 10);
  await new Promise((resolve) => setTimeout(resolve, s * 1000));
  return { ok: true, message: `Waited ${s} seconds.` };
}
