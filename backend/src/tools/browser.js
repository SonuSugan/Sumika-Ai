import { requestHelp } from './helpBus.js';
import { getPage, isCloud, detectBlocker } from './browserSession.js';

const SITE_URLS = {
  linkedin: (q, loc) => `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(q)}${loc ? `&location=${encodeURIComponent(loc)}` : ''}`,
  indeed: (q, loc) => `https://www.indeed.com/jobs?q=${encodeURIComponent(q)}${loc ? `&l=${encodeURIComponent(loc)}` : ''}`,
  naukri: (q, loc) => `https://www.naukri.com/${encodeURIComponent(q).replace(/%20/g, '-')}-jobs${loc ? `-in-${encodeURIComponent(loc)}` : ''}`
};

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

  const page = await getPage();
  const url = buildUrl(query, location);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  const blocker = await detectBlocker(page);
  if (blocker) {
    const { promise } = requestHelp({
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

export { closeBrowser } from './browserSession.js';
