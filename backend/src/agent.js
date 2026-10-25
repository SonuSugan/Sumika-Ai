import { chat } from './llm/router.js';
import { buildSystemPrompt, TOOLS, OWNER_TOOL_NAMES } from './persona.js';
import { memoryForPrompt } from './memory.js';
import { interpretReply } from './confirmations.js';
import { memoryTool, routineTool, getTime, setTimer } from './tools/assistant.js';
import { openApp, openUrl, webSearch } from './tools/system.js';
import { browseJobSite } from './tools/browser.js';
import { applyToJob } from './tools/jobApply.js';
import {
  openInBrowser,
  browserHistory,
  scrollInBrowser,
  clickInBrowser,
  typeInBrowser,
  selectInBrowser,
  fillForm,
  pressKeyInBrowser,
  readBrowserPage,
  browserTabs,
  waitInBrowser
} from './tools/browserControl.js';
import { getProfile } from './profile.js';

const TOOL_IMPL = {
  open_app: ({ name }) => openApp(name),
  open_url: ({ url }) => openUrl(url),
  web_search: ({ query }) => webSearch(query),
  browse_job_site: ({ site, query, location }) => browseJobSite({ site, query, location }),
  apply_to_job: ({ url, jobContext }) => applyToJob({ url, jobContext }),
  // The resume is read on demand instead of riding along in every prompt - it
  // was the biggest static chunk, and free-tier models cap tokens per minute.
  read_resume: async () => {
    const profile = await getProfile().catch(() => null);
    return profile?.resumeText ? { ok: true, message: profile.resumeText.slice(0, 8000) } : { ok: false, message: 'No resume is on file yet.' };
  },
  open_in_browser: (args) => openInBrowser(args),
  browser_history: (args) => browserHistory(args),
  scroll_in_browser: (args) => scrollInBrowser(args),
  click_in_browser: (args, ctx) => clickInBrowser(args, ctx),
  type_in_browser: (args) => typeInBrowser(args),
  select_in_browser: (args) => selectInBrowser(args),
  fill_form: (args) => fillForm(args),
  press_key_in_browser: (args) => pressKeyInBrowser(args),
  read_browser_page: () => readBrowserPage(),
  browser_tabs: (args) => browserTabs(args),
  wait_in_browser: (args) => waitInBrowser(args),
  memory: (args) => memoryTool(args),
  routine: (args) => routineTool(args),
  get_time: (args, ctx) => getTime(args, ctx),
  set_timer: (args) => setTimer(args)
};

// These reach into the owner's real browser (and read what's on their pages),
// so they only run for a caller who has proven they're the owner.
const OWNER_TOOLS = new Set(OWNER_TOOL_NAMES);
const PUBLIC_TOOLS = TOOLS.filter((t) => !OWNER_TOOLS.has(t.function.name));

const NOT_TRUSTED_MESSAGE =
  "That needs your Sumika access code. Tell the user to enter it in Sumika's Browser control box, then ask again.";

// A job like "open X, scroll, click Y, fill the form" is several tool calls in
// a row, each one chosen after seeing the last result. This bounds how many
// rounds one message can take so a confused model can't loop forever.
const MAX_STEPS = 12;

// Keeps a short rolling conversation history per session so Sumika has context.
const sessions = new Map();

// Sumika is always-on with a single long-lived session ('local-user') that
// never resets on its own, so its history grows without bound over hours of
// use. Past a certain length, small/fast fallback models start losing track
// of which turn is current - they'll skip re-calling a tool ("it's already
// open") or echo a stale argument from an earlier call instead of reasoning
// fresh. Trimming to the most recent turns keeps every request working the
// same way a fresh session would, no matter how long Sumika's been running.
// Cuts only at "user message" boundaries (never mid-turn) so a trimmed
// assistant tool_calls message is never separated from its tool results,
// which every provider's API requires to stay paired.
const MAX_TURNS = 6;

// Tool output from earlier messages (a page's text, a resume) is what bloats the
// context most and is rarely needed once its turn is over.
const OLD_TOOL_OUTPUT_LIMIT = 400;

function shrinkOldToolOutput(messages) {
  for (const m of messages) {
    if (m.role === 'tool' && m.content.length > OLD_TOOL_OUTPUT_LIMIT) m.content = `${m.content.slice(0, OLD_TOOL_OUTPUT_LIMIT)}...(cut)`;
  }
}

function trimHistory(session) {
  const [systemMsg, ...rest] = session.messages;
  const userIndices = rest.reduce((acc, m, i) => (m.role === 'user' ? [...acc, i] : acc), []);
  if (userIndices.length > MAX_TURNS) {
    const cutAt = userIndices[userIndices.length - MAX_TURNS];
    session.messages = [systemMsg, ...rest.slice(cutAt)];
  }
}

// Re-checks the profile on every message (cheap) and refreshes the system
// prompt's embedded resume if it changed - e.g. after the user re-uploads one
// mid-session - without losing the rest of the conversation history.
// Owner and public callers never share a conversation, whatever session id
// they send: the owner's history holds what the browser tools read.
const sessionKey = (sessionId, trusted) => `${trusted ? 'owner' : 'public'}:${sessionId}`;

async function getHistory(sessionId, trusted) {
  const profile = await getProfile().catch(() => null);
  // What the owner has taught Sumika is part of the prompt - re-read on every
  // message so a fact learned a moment ago is known on the very next one.
  const memory = trusted ? await memoryForPrompt().catch(() => null) : null;
  const stamp = `${profile?.resumeText ? `has:${profile.updatedAt || ''}` : 'none'}|${memory?.stamp || '-'}`;
  const key = sessionKey(sessionId, trusted);
  const system = () => ({ role: 'system', content: buildSystemPrompt(profile, { browser: trusted, memory }) });

  if (!sessions.has(key)) sessions.set(key, { profileStamp: stamp, messages: [system()] });

  const session = sessions.get(key);
  if (session.profileStamp !== stamp) {
    session.profileStamp = stamp;
    session.messages[0] = system();
  }

  // Safe to trim here (not mid-handleUserMessage): the previous call always
  // finished with a plain assistant reply, so there's no dangling tool_calls
  // message that trimming could separate from its tool results.
  trimHistory(session);
  shrinkOldToolOutput(session.messages);

  return session.messages;
}

// A page read is the biggest thing that goes back to the model each step, and
// every read makes the previous one stale (its [numbers] are reassigned). Keeping
// only the latest keeps a long job inside free-tier token limits.
const pageReads = new WeakSet();
const STALE_READ = JSON.stringify({ ok: true, message: '(an older snapshot of a page - omitted, a newer one came after it)' });

function dropStaleReads(history, latest) {
  for (const m of history) {
    if (m !== latest && pageReads.has(m)) {
      m.content = STALE_READ;
      pageReads.delete(m);
    }
  }
}

async function runTool(call, onToolEvent, context) {
  const name = call.function.name;
  const fn = TOOL_IMPL[name];
  if (!fn) return { ok: false, message: `Unknown tool: ${name}` };

  let args = {};
  try {
    args = JSON.parse(call.function.arguments || '{}');
  } catch {
    args = {};
  }

  onToolEvent?.({ name, args, status: 'running' });
  let result;
  if (OWNER_TOOLS.has(name) && !context.trusted) {
    result = { ok: false, message: NOT_TRUSTED_MESSAGE };
  } else {
    try {
      result = await fn(args, context);
    } catch (err) {
      result = { ok: false, message: err.message };
    }
  }
  onToolEvent?.({ name, args, status: 'done', result });
  return result;
}

// Free-tier models sometimes finish a tool-using turn with an empty message.
// A silent assistant reads as "broken", so ask once more for a one-line wrap-up
// and, failing that, fall back to what the last tool itself reported.
async function ensureReply(history, response, actions, { stillWanted }) {
  const text = (response.content || '').trim();
  if (text && !stillWanted) return text;

  const nudge = stillWanted
    ? 'Stop calling tools now. Tell the user in one or two short sentences what you did and what is left.'
    : 'Reply to the user in one short spoken sentence about what you just did or found.';
  try {
    const wrapUp = await chat({ messages: [...history, { role: 'user', content: nudge }], tools: [] });
    if ((wrapUp.content || '').trim()) return wrapUp.content.trim();
  } catch {
    // fall through to the tool-result fallback below
  }
  return text || actions.at(-1)?.result?.message || 'Done.';
}

export async function handleUserMessage(sessionId, text, onToolEvent, context = {}) {
  const history = await getHistory(sessionId, Boolean(context.trusted));
  context = { ...context, sessionKey: sessionKey(sessionId, Boolean(context.trusted)) };

  // The user's own words are the only thing that can approve a final action;
  // the model is told the outcome, it never decides it.
  let note = '';
  const verdict = context.trusted ? interpretReply(context.sessionKey, text) : null;
  if (verdict?.approved) note = `\n[Sumika: the user just said yes to "${verdict.label}". You may now click it with click_in_browser confirm:true.]`;
  else if (verdict?.denied) note = `\n[Sumika: the user declined "${verdict.label}". Do not click it.]`;
  history.push({ role: 'user', content: text + note });

  // Callers who haven't proven they're the owner aren't even offered the
  // browser tools - fewer tokens, and nothing for them to try.
  const tools = context.trusted ? TOOLS : PUBLIC_TOOLS;
  const actions = [];
  let response = await chat({ messages: history, tools });

  let steps = 0;
  while (response.toolCalls?.length && steps < MAX_STEPS) {
    steps += 1;
    history.push({
      role: 'assistant',
      content: response.content || '',
      tool_calls: response.toolCalls
    });

    for (const call of response.toolCalls) {
      const result = await runTool(call, onToolEvent, context);
      actions.push({ tool: call.function.name, result });
      const toolMessage = {
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result)
      };
      history.push(toolMessage);
      // Anything that returned a page snapshot (a read, or landing on a new page).
      if (result.ok && typeof result.message === 'string' && result.message.includes('Interactive elements')) {
        pageReads.add(toolMessage);
        dropStaleReads(history, toolMessage);
      }
    }

    response = await chat({ messages: history, tools });
  }

  const stillWanted = Boolean(response.toolCalls?.length);
  const reply = await ensureReply(history, response, actions, { stillWanted });
  history.push({ role: 'assistant', content: reply });

  return { reply, provider: response.provider, actions };
}

export function resetSession(sessionId) {
  sessions.delete(sessionKey(sessionId, true));
  sessions.delete(sessionKey(sessionId, false));
}
