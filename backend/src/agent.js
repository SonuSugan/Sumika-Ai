import { chat } from './llm/router.js';
import { buildSystemPrompt, TOOLS } from './persona.js';
import { openApp, openUrl, webSearch } from './tools/system.js';
import { browseJobSite } from './tools/browser.js';
import { applyToJob } from './tools/jobApply.js';
import { openInBrowser, scrollInBrowser, clickInBrowser, readBrowserPage } from './tools/browserControl.js';
import { getProfile } from './profile.js';

const TOOL_IMPL = {
  open_app: ({ name }) => openApp(name),
  open_url: ({ url }) => openUrl(url),
  web_search: ({ query }) => webSearch(query),
  browse_job_site: ({ site, query, location }) => browseJobSite({ site, query, location }),
  apply_to_job: ({ url, jobContext }) => applyToJob({ url, jobContext }),
  open_in_browser: ({ url }) => openInBrowser({ url }),
  scroll_in_browser: ({ direction, amount }) => scrollInBrowser({ direction, amount }),
  click_in_browser: ({ text }) => clickInBrowser({ text }),
  read_browser_page: () => readBrowserPage()
};

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
const MAX_TURNS = 8;

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
async function getHistory(sessionId) {
  const profile = await getProfile().catch(() => null);
  const profileStamp = profile?.updatedAt ? String(profile.updatedAt) : 'none';

  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      profileStamp,
      messages: [{ role: 'system', content: buildSystemPrompt(profile) }]
    });
  }

  const session = sessions.get(sessionId);
  if (session.profileStamp !== profileStamp) {
    session.profileStamp = profileStamp;
    session.messages[0] = { role: 'system', content: buildSystemPrompt(profile) };
  }

  // Safe to trim here (not mid-handleUserMessage): the previous call always
  // finished with a plain assistant reply, so there's no dangling tool_calls
  // message that trimming could separate from its tool results.
  trimHistory(session);

  return session.messages;
}

export async function handleUserMessage(sessionId, text, onToolEvent) {
  const history = await getHistory(sessionId);
  history.push({ role: 'user', content: text });

  const first = await chat({ messages: history, tools: TOOLS });

  if (!first.toolCalls || first.toolCalls.length === 0) {
    history.push({ role: 'assistant', content: first.content });
    return { reply: first.content, provider: first.provider, actions: [] };
  }

  history.push({
    role: 'assistant',
    content: first.content || '',
    tool_calls: first.toolCalls
  });

  const actions = [];
  for (const call of first.toolCalls) {
    const fn = TOOL_IMPL[call.function.name];
    let result;
    if (!fn) {
      result = { ok: false, message: `Unknown tool: ${call.function.name}` };
    } else {
      let args = {};
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch {
        args = {};
      }
      onToolEvent?.({ name: call.function.name, args, status: 'running' });
      try {
        result = await fn(args);
      } catch (err) {
        result = { ok: false, message: err.message };
      }
      onToolEvent?.({ name: call.function.name, args, status: 'done', result });
    }
    actions.push({ tool: call.function.name, result });
    history.push({
      role: 'tool',
      tool_call_id: call.id,
      content: JSON.stringify(result)
    });
  }

  const second = await chat({ messages: history, tools: TOOLS });
  history.push({ role: 'assistant', content: second.content });

  return { reply: second.content, provider: second.provider, actions };
}

export function resetSession(sessionId) {
  sessions.delete(sessionId);
}
