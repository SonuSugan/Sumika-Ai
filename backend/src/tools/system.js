import { exec } from 'node:child_process';

// Render (and most cloud hosts) set this automatically. These tools reach out
// to a desktop/display that only exists on your own PC, so they no-op gracefully
// instead of doing something meaningless on a remote server.
const isCloud = () => Boolean(process.env.RENDER) || process.platform !== 'win32';

const CLOUD_MESSAGE =
  "I'm running in the cloud right now, so I can't reach your desktop for that - run Sumika locally on your PC for app/browser control.";

// The LLM picks whatever name it thinks is natural ("calculator", "paint",
// "file explorer"...) but Windows' `start` command only resolves a narrow set
// of literal aliases. Map the common ones so the app actually opens regardless
// of exactly what word the model used.
const APP_ALIASES = {
  calculator: 'calc',
  calc: 'calc',
  notepad: 'notepad',
  paint: 'mspaint',
  mspaint: 'mspaint',
  explorer: 'explorer',
  'file explorer': 'explorer',
  'files': 'explorer',
  word: 'winword',
  excel: 'excel',
  powerpoint: 'powerpnt',
  chrome: 'chrome',
  'google chrome': 'chrome',
  edge: 'msedge',
  'microsoft edge': 'msedge',
  settings: 'ms-settings:',
  'windows settings': 'ms-settings:',
  spotify: 'spotify',
  'vs code': 'code',
  vscode: 'code',
  'visual studio code': 'code',
  cmd: 'cmd',
  terminal: 'wt',
  'command prompt': 'cmd',
  powershell: 'powershell',
  snipping: 'ms-screenclip:',
  'snipping tool': 'ms-screenclip:'
};

function resolveAppCommand(name) {
  const key = String(name).trim().toLowerCase();
  return APP_ALIASES[key] || name;
}

// Opens a Windows app by name using the Start menu resolver ("start appname").
// Free, no API - relies on Windows' own app name matching, with a small alias
// table on top for names people (and the LLM) actually say.
export function openApp(name) {
  if (isCloud()) return Promise.resolve({ ok: false, message: CLOUD_MESSAGE });
  return new Promise((resolve) => {
    const command = resolveAppCommand(name);
    const safe = String(command).replace(/[&|<>^"]/g, '');
    exec(`start "" "${safe}"`, { shell: 'cmd.exe' }, (err) => {
      if (err) {
        resolve({ ok: false, message: `Couldn't find/open "${name}" on this PC.` });
      } else {
        resolve({ ok: true, message: `Opened ${name}.` });
      }
    });
  });
}

// The LLM sometimes passes a bare site name instead of a URL (e.g. "gmail"
// instead of "https://mail.google.com") - especially from smaller fallback
// models when a fast provider is rate-limited. Resolving well-known sites
// ourselves means the link always works regardless of which AI answered.
const SITE_ALIASES = {
  gmail: 'https://mail.google.com/mail/u/0/#inbox',
  'google mail': 'https://mail.google.com/mail/u/0/#inbox',
  youtube: 'https://www.youtube.com',
  linkedin: 'https://www.linkedin.com/feed/',
  naukri: 'https://www.naukri.com/mnjuser/homepage',
  github: 'https://github.com',
  'google docs': 'https://docs.google.com',
  'google sheets': 'https://sheets.google.com',
  'google drive': 'https://drive.google.com',
  'google calendar': 'https://calendar.google.com',
  'google maps': 'https://maps.google.com',
  maps: 'https://maps.google.com',
  whatsapp: 'https://web.whatsapp.com',
  'whatsapp web': 'https://web.whatsapp.com',
  outlook: 'https://outlook.live.com/mail/',
  netflix: 'https://www.netflix.com',
  amazon: 'https://www.amazon.com',
  twitter: 'https://twitter.com',
  x: 'https://twitter.com',
  facebook: 'https://www.facebook.com',
  instagram: 'https://www.instagram.com',
  chatgpt: 'https://chat.openai.com',
  spotify: 'https://open.spotify.com',
  notion: 'https://www.notion.so'
};

// Same known sites, indexed by hostname instead of name. The LLM sometimes
// invents a full-looking URL for a known site with a wrong/nonexistent path
// (e.g. "https://www.youtube.com/oops") instead of just naming the site - a
// plausible guess is still a hallucination, and since it already looks like a
// URL, a bare-name lookup never catches it. Matching by hostname does.
const HOMEPAGE_BY_HOST = {};
for (const homepage of new Set(Object.values(SITE_ALIASES))) {
  try {
    HOMEPAGE_BY_HOST[new URL(homepage).hostname.replace(/^www\./, '')] = homepage;
  } catch {
    // unreachable - every SITE_ALIASES value above is a valid absolute URL
  }
}

// Normalizes whatever the LLM handed us into an actually-openable URL:
// resolve known site names, add a protocol to bare domains, and fall back to
// a web search for anything that isn't recognizably a URL at all (instead of
// silently handing the browser a broken address like "gmail" or "open my mail").
function resolveUrl(input) {
  const raw = String(input || '').trim();
  const key = raw.toLowerCase().replace(/^(open|go to|launch)\s+/, '').replace(/\.$/, '');
  if (SITE_ALIASES[key]) return SITE_ALIASES[key];

  if (/^https?:\/\//i.test(raw)) {
    try {
      const host = new URL(raw).hostname.replace(/^www\./, '');
      if (HOMEPAGE_BY_HOST[host]) return HOMEPAGE_BY_HOST[host];
    } catch {
      // malformed - fall through to the search fallback below
    }
    return raw;
  }

  // Looks like a bare domain (has a dot, no spaces) - just missing the protocol.
  if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(raw) && !raw.includes(' ')) {
    return `https://${raw}`;
  }

  // Not a recognizable URL or known site at all - treat it as a search instead
  // of opening a dead link.
  return `https://duckduckgo.com/?q=${encodeURIComponent(raw)}`;
}

// Unlike open_app/browse_job_site, opening a URL doesn't need OS-level access -
// the frontend is already running in the user's own browser, wherever the
// backend itself is hosted. So this just tells the frontend to window.open()
// it client-side instead of trying (and failing, in the cloud) to launch a
// browser on the server's machine.
export async function openUrl(url) {
  const resolved = resolveUrl(url);
  return { ok: true, message: `Opened ${resolved} in your browser.`, clientAction: { type: 'open_url', url: resolved } };
}

export async function webSearch(query) {
  const url = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
  return { ok: true, message: `Searching the web for "${query}".`, clientAction: { type: 'open_url', url } };
}
