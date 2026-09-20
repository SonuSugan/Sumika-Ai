import { chromium } from 'playwright';
import path from 'node:path';
import os from 'node:os';

// Shared by every tool that drives Sumika's own automated browser window
// (browse_job_site, apply_to_job, and the generic open/scroll/click/read
// tools) so "open linkedin" -> "scroll down" -> "click Jobs" all act on the
// SAME window instead of each tool silently opening its own separate one.
//
// No web page - Sumika's frontend included - can ever reach into a browser
// tab you already have open elsewhere; that's a hard cross-origin security
// boundary no site can cross. The closest safe equivalent is to have the
// LOCAL BACKEND (a normal desktop process, not sandboxed like a page) launch
// your actual installed Chrome (`channel: 'chrome'`, not Playwright's bundled
// Chromium - hence the unfamiliar icon/branding before this) with its own
// persistent profile folder. It's real Chrome, just a separate profile from
// your everyday one (so it won't fight over the same profile lock if both are
// open at once) - log into LinkedIn/Gmail/etc. there once and it stays
// signed in on every later launch, same as any Chrome profile does.
let browserContext = null;
let currentPage = null;
const PROFILE_DIR = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'Sumika', 'chrome-profile');

// Render (and most cloud hosts) set this automatically. Every tool here needs
// a visible window on YOUR screen (for watching it work, and for CAPTCHA/login
// hand-off), which doesn't exist on a remote server, so callers should check
// this first and no-op gracefully instead of trying to launch a headed
// browser with nothing to display it on.
export const isCloud = () => Boolean(process.env.RENDER) || process.platform !== 'win32';

export async function getPage() {
  if (!browserContext) {
    browserContext = await chromium.launchPersistentContext(PROFILE_DIR, {
      channel: 'chrome',
      headless: false,
      viewport: null
    });
  }
  if (!currentPage || currentPage.isClosed()) {
    // launchPersistentContext opens with one blank tab already - reuse it
    // instead of adding a second, since a fresh profile only has that one.
    currentPage = browserContext.pages()[0] || (await browserContext.newPage());
  }
  return currentPage;
}

export const BLOCK_INDICATORS = [
  'iframe[src*="captcha"]',
  'iframe[title*="captcha" i]',
  'text=/verify you.?re human/i',
  'text=/unusual traffic/i',
  'text=/are you a robot/i',
  '#captcha',
  '.g-recaptcha',
  'input[type="password"]'
];

export async function detectBlocker(page) {
  for (const selector of BLOCK_INDICATORS) {
    try {
      const el = page.locator(selector).first();
      if (await el.isVisible({ timeout: 500 }).catch(() => false)) {
        return selector.includes('password') ? 'login wall' : 'CAPTCHA / bot-check';
      }
    } catch {
      // selector not present, keep checking
    }
  }
  return null;
}

export async function closeBrowser() {
  if (browserContext) {
    await browserContext.close();
    browserContext = null;
    currentPage = null;
  }
}
