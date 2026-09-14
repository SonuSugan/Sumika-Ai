import { chromium } from 'playwright';
import { requestHelp } from './helpBus.js';
import { getProfile } from '../profile.js';
import { chat } from '../llm/router.js';

const isCloud = () => Boolean(process.env.RENDER) || process.platform !== 'win32';

const BLOCK_INDICATORS = [
  'iframe[src*="captcha"]',
  'text=/verify you.?re human/i',
  'text=/unusual traffic/i',
  '.g-recaptcha',
  'input[type="password"]'
];

let browserInstance = null;
async function getBrowser() {
  if (!browserInstance) browserInstance = await chromium.launch({ headless: false });
  return browserInstance;
}

async function detectBlocker(page) {
  for (const selector of BLOCK_INDICATORS) {
    try {
      const el = page.locator(selector).first();
      if (await el.isVisible({ timeout: 500 }).catch(() => false)) {
        return selector.includes('password') ? 'login wall' : 'CAPTCHA / bot-check';
      }
    } catch {
      // keep checking
    }
  }
  return null;
}

// Reads every visible input/textarea and whatever label text is nearest to it -
// best-effort since every job site (Workday, Greenhouse, LinkedIn, Lever...)
// structures its forms differently.
async function scanFields(page) {
  return page.$$eval('input, textarea, select', (els) =>
    els
      .filter((el) => el.offsetParent !== null && el.type !== 'hidden' && el.type !== 'submit' && el.type !== 'button')
      .map((el, i) => {
        const id = el.id || `field_${i}`;
        const labelEl = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
        const wrapperLabel = el.closest('label');
        const nearbyText =
          labelEl?.innerText || wrapperLabel?.innerText || el.getAttribute('aria-label') || el.placeholder || '';
        return {
          index: i,
          tag: el.tagName.toLowerCase(),
          type: el.type || 'text',
          label: nearbyText.trim().slice(0, 200),
          name: el.name || '',
          value: el.value || ''
        };
      })
  ).then((fields) => fields.map((f, i) => ({ ...f, selector: `${f.tag}:nth-of-type(1)`, domIndex: i })));
}

function classifyField(field, profile) {
  const label = `${field.label} ${field.name}`.toLowerCase();
  if (field.type === 'email' || label.includes('email')) return { kind: 'contact', value: profile.email };
  if (field.type === 'tel' || label.includes('phone')) return { kind: 'contact', value: profile.phone };
  if (label.includes('linkedin')) return { kind: 'contact', value: profile.linkedin };
  if (label.includes('github')) return { kind: 'contact', value: profile.github };
  if (label.includes('first name')) return { kind: 'contact', value: profile.name?.split(' ')[0] };
  if (label.includes('last name')) return { kind: 'contact', value: profile.name?.split(' ').slice(1).join(' ') };
  if (label.includes('full name') || label === 'name') return { kind: 'contact', value: profile.name };
  if (field.tag === 'textarea' || (field.type === 'text' && field.label.length > 20)) {
    return { kind: 'essay', question: field.label || field.name };
  }
  return null;
}

async function draftAnswer(question, profile, jobContext) {
  const result = await chat({
    messages: [
      {
        role: 'system',
        content:
          'You draft short, honest, first-person answers to job application questions, grounded ONLY in the candidate resume text given. 2-4 sentences. No fabrication - if the resume does not support a claim, keep it general and honest.'
      },
      {
        role: 'user',
        content: `Resume:\n${profile.resumeText || '(no resume on file)'}\n\n${jobContext ? `Job context: ${jobContext}\n\n` : ''}Application question: "${question}"\n\nDraft my answer.`
      }
    ],
    tools: []
  });
  return result.content.trim();
}

// Fills a job application form from the stored profile/resume, drafts answers
// for open-ended questions with the LLM, and STOPS before submitting - Sumika
// never clicks Submit/Apply herself. It pauses and asks the human to review
// (and the UI reads the drafted answers aloud) before they submit it themselves.
export async function applyToJob({ url, jobContext }) {
  if (isCloud()) {
    return { ok: false, message: "I'm running in the cloud right now, so I can't fill out a form on your screen - run Sumika locally on your PC for this." };
  }

  const profile = await getProfile();
  if (!profile || !profile.resumeText) {
    return { ok: false, message: "I don't have your resume on file yet - upload it first (Profile > Upload Resume), then ask me to apply." };
  }

  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  const blocker = await detectBlocker(page);
  if (blocker) {
    const { id, promise } = requestHelp({
      reason: `Hit a ${blocker} while opening the application page. Please handle it in the browser window, then click "I've handled it".`,
      url: page.url()
    });
    await promise;
    await page.waitForTimeout(800);
  }

  const fields = await scanFields(page);
  const qa = [];

  for (const field of fields) {
    const classification = classifyField(field, profile);
    if (!classification) continue;

    try {
      const locator = field.tag === 'select' ? null : page.locator(`${field.tag}[name="${field.name}"]`).first();

      if (classification.kind === 'contact' && classification.value && locator) {
        await locator.fill(String(classification.value)).catch(() => {});
      } else if (classification.kind === 'essay' && locator) {
        const answer = await draftAnswer(classification.question, profile, jobContext);
        await locator.fill(answer).catch(() => {});
        qa.push({ question: classification.question, answer });
      }
    } catch {
      // couldn't resolve/fill this field - skip it, it's a best-effort autofill
    }
  }

  if (qa.length > 0) {
    const { id, promise } = requestHelp({
      kind: 'review',
      reason: `I've filled the application and drafted ${qa.length} answer${qa.length > 1 ? 's' : ''}. Please review them, then click Submit/Apply yourself in the browser window when you're happy with it.`,
      url: page.url(),
      qa
    });
    await promise;
  }

  return {
    ok: true,
    message: qa.length > 0
      ? `Filled the form and drafted ${qa.length} answer(s) - review them in the browser window and submit whenever you're ready. I won't submit it myself.`
      : "Filled in your contact details on the form. No open-ended questions found - review it in the browser window and submit when ready."
  };
}
