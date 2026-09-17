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

// Unlike open_app/browse_job_site, opening a URL doesn't need OS-level access -
// the frontend is already running in the user's own browser, wherever the
// backend itself is hosted. So this just tells the frontend to window.open()
// it client-side instead of trying (and failing, in the cloud) to launch a
// browser on the server's machine.
export async function openUrl(url) {
  return { ok: true, message: `Opened ${url} in your browser.`, clientAction: { type: 'open_url', url } };
}

export async function webSearch(query) {
  const url = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
  return { ok: true, message: `Searching the web for "${query}".`, clientAction: { type: 'open_url', url } };
}
