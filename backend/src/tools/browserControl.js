import { sendCommand } from './extensionBridge.js';
import { resolveUrl } from './system.js';

// Drives the user's REAL, already-open Chrome via the Sumika extension
// (backend/../extension) - not a separate Playwright window like
// browse_job_site/apply_to_job use. A plain web app can never reach another
// tab's DOM across origins, so this is the one part of Sumika that has to be
// an actual browser extension; sendCommand() talks to it over the /ext
// WebSocket wired up in server.js.

export async function openInBrowser({ url }) {
  // chrome.tabs.update resolves a scheme-less string relative to the
  // extension's OWN origin (chrome-extension://...) rather than treating it
  // as a web address, so this must always hand it a full, resolved URL.
  const result = await sendCommand('navigate', { url: resolveUrl(url) });
  return { ok: true, message: `Opened ${result.url} in your Chrome tab.` };
}

export async function scrollInBrowser({ direction = 'down', amount = 'normal' }) {
  const result = await sendCommand('scroll', { direction, amount });
  return { ok: true, message: `Scrolled ${direction} on ${result.url}.` };
}

// Never clicks Submit/Apply/Pay/etc. - same rule as apply_to_job: Sumika
// navigates and reads, the human commits to anything final.
const NEVER_CLICK = /\b(submit|apply now|pay|buy|purchase|checkout|confirm order|place order|delete account)\b/i;

export async function clickInBrowser({ text }) {
  if (NEVER_CLICK.test(String(text || ''))) {
    return { ok: false, message: `I won't click "${text}" - that looks like a final/irreversible action. Please click that one yourself.` };
  }
  const result = await sendCommand('click', { text });
  if (!result.found) {
    return { ok: false, message: `I don't see anything matching "${text}" on the page right now.` };
  }
  return { ok: true, message: `Clicked "${result.matchedText || text}" on ${result.url}.` };
}

export async function readBrowserPage() {
  const result = await sendCommand('read', {});
  return {
    ok: true,
    message: `On "${result.title}" (${result.url}): ${result.text || '(page looks empty)'}`
  };
}
