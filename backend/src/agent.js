import { chat } from './llm/router.js';
import { buildSystemPrompt, TOOLS } from './persona.js';
import { openApp, openUrl, webSearch } from './tools/system.js';
import { browseJobSite } from './tools/browser.js';
import { applyToJob } from './tools/jobApply.js';
import { getProfile } from './profile.js';

const TOOL_IMPL = {
  open_app: ({ name }) => openApp(name),
  open_url: ({ url }) => openUrl(url),
  web_search: ({ query }) => webSearch(query),
  browse_job_site: ({ site, query, location }) => browseJobSite({ site, query, location }),
  apply_to_job: ({ url, jobContext }) => applyToJob({ url, jobContext })
};

// Keeps a short rolling conversation history per session so Sumika has context.
const sessions = new Map();

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
