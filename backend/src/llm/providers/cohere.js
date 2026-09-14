import fetch from 'node-fetch';

// Cohere free trial tier - uses its own Chat API shape, not OpenAI's.
export async function callCohere({ messages }) {
  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) throw new Error('COHERE_API_KEY not set');

  const systemMsg = messages.find((m) => m.role === 'system');
  const history = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(0, -1)
    .map((m) => ({ role: m.role === 'assistant' ? 'CHATBOT' : 'USER', message: m.content }));
  const last = [...messages].reverse().find((m) => m.role === 'user');

  const res = await fetch('https://api.cohere.com/v1/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: process.env.COHERE_MODEL || 'command-r',
      preamble: systemMsg?.content,
      chat_history: history,
      message: last?.content || ''
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cohere error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return { provider: 'cohere', content: data.text || '', toolCalls: [] };
}
