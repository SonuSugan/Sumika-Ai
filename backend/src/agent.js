import { chat } from './llm/router.js';
import { SYSTEM_PROMPT, TOOLS } from './persona.js';
import { openApp, openUrl, webSearch } from './tools/system.js';
import { browseJobSite } from './tools/browser.js';

const TOOL_IMPL = {
  open_app: ({ name }) => openApp(name),
  open_url: ({ url }) => openUrl(url),
  web_search: ({ query }) => webSearch(query),
  browse_job_site: ({ site, query, location }) => browseJobSite({ site, query, location })
};

// Keeps a short rolling conversation history per session so Sumika has context.
const sessions = new Map();

function getHistory(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, [{ role: 'system', content: SYSTEM_PROMPT }]);
  }
  return sessions.get(sessionId);
}

export async function handleUserMessage(sessionId, text, onToolEvent) {
  const history = getHistory(sessionId);
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
