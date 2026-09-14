import { exec } from 'node:child_process';
import open from 'open';

// Opens a Windows app by name using the Start menu resolver ("start appname").
// Free, no API - relies on Windows' own app name matching.
export function openApp(name) {
  return new Promise((resolve) => {
    const safe = String(name).replace(/[&|<>^"]/g, '');
    exec(`start "" "${safe}"`, { shell: 'cmd.exe' }, (err) => {
      if (err) {
        resolve({ ok: false, message: `Couldn't find/open "${name}" on this PC.` });
      } else {
        resolve({ ok: true, message: `Opened ${name}.` });
      }
    });
  });
}

export async function openUrl(url) {
  await open(url);
  return { ok: true, message: `Opened ${url} in your browser.` };
}

export async function webSearch(query) {
  const url = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
  await open(url);
  return { ok: true, message: `Searching the web for "${query}".` };
}
