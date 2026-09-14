import fetch from 'node-fetch';

// Ollama - fully local & free, no API key. https://ollama.com
export async function callOllama({ messages, tools }) {
  const host = process.env.OLLAMA_HOST || 'http://localhost:11434';
  const res = await fetch(`${host}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OLLAMA_MODEL || 'llama3.2',
      messages,
      tools,
      stream: false
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const msg = data.message || {};
  return {
    provider: 'ollama',
    content: msg.content || '',
    toolCalls: msg.tool_calls || []
  };
}
