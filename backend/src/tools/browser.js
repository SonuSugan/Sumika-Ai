import { chromium } from 'playwright';
import { requestHelp } from './helpBus.js';

const SITE_URLS = {
  linkedin: (q, loc) => `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(q)}${loc ? `&location=${encodeURIComponent(loc)}` : ''}`,
  indeed: (q, loc) => `https://www.indeed.com/jobs?q=${encodeURIComponent(q)}${loc ? `&l=${encodeURIComponent(loc)}` : ''}`,
  naukri: (q, loc) => `https://www.naukri.com/${encodeURIComponent(q).replace(/%20/g, '-')}-jobs${loc ? `-in-${encodeURIComponent(loc)}` : ''}`
};

const BLOCK_INDICATORS = [
  'iframe[src*="captcha"]',
  'iframe[title*="captcha" i]',
  'text=/verify you.?re human/i',
  'text=/unusual traffic/i',
  'text=/are you a robot/i',
  '#captcha',
  '.g-recaptcha',
  'input[type="password"]'
];

// Render (and most cloud hosts) set this automatically. This tool needs a
// visible window on YOUR screen for CAPTCHA/login hand-off, which doesn't
// exist on a remote server, so it no-ops there instead of trying (and failing)
// to launch a headed browser with nothing to display it on.
const isCloud = () => Boolean(process.env.RENDER) || process.platform !== 'win32';

let browserInstance = null;

async function getBrowser() {
  if (!browserInstance) {
    browserInstance = await chromium.launch({ headless: false });
  }
  return browserInstance;
}

async function detectBlocker(page) {
  for (const selector of BLOCK_INDICATORS) {
    try {
      const el = await page.locator(selector).first();
      if (await el.isVisible({ timeout: 500 }).catch(() => false)) {
        return selector.includes('password') ? 'login wall' : 'CAPTCHA / bot-check';
      }
    } catch {
      // selector not present, keep checking
    }
  }
  return null;
}

// Opens a job search, and if it hits a CAPTCHA/login/bot-check, pauses and
// asks the human (via helpBus -> WebSocket -> popup) to clear it before continuing.
export async function browseJobSite({ site, query, location }) {
  if (isCloud()) {
    return {
      ok: false,
      message: "I'm running in the cloud right now, so I can't pop open a browser window on your screen for job search - run Sumika locally on your PC for this."
    };
  }
  const key = String(site).toLowerCase();
  const buildUrl = SITE_URLS[key];
  if (!buildUrl) {
    return { ok: false, message: `I don't know the site "${site}" yet. Try linkedin, indeed, or naukri.` };
  }

  const browser = await getBrowser();
  const page = await browser.newPage();
  const url = buildUrl(query, location);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  const blocker = await detectBlocker(page);
  if (blocker) {
    const { id, promise } = requestHelp({
      reason: `Hit a ${blocker} on ${key} while searching for "${query}". Please handle it in the browser window, then click "I've handled it".`,
      url: page.url()
    });
    await promise;
    await page.waitForTimeout(1000);
  }

  return {
    ok: true,
    message: `Opened ${key} job search for "${query}"${location ? ` in ${location}` : ''}. The browser window is up for you to review and apply.`
  };
}

export async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}
