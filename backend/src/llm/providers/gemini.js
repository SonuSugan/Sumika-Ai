import fetch from 'node-fetch';

// Google Gemini free tier. https://aistudio.google.com/app/apikey
// Gemini's native tool-call schema differs from OpenAI's, so we translate both ways.
export async function callGemini({ messages, tools }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');
  const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

  const systemMsg = messages.find((m) => m.role === 'system');
  const rest = messages.filter((m) => m.role !== 'system');

  const contents = rest.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content || '' }]
  }));

  const geminiTools = tools?.length
    ? [{
        functionDeclarations: tools.map((t) => ({
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters
        }))
      }]
    : undefined;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: systemMsg ? { parts: [{ text: systemMsg.content }] } : undefined,
        tools: geminiTools
      })
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];
  const parts = candidate?.content?.parts || [];

  const toolCalls = parts
    .filter((p) => p.functionCall)
    .map((p, i) => ({
      id: `gemini_call_${i}`,
      function: {
        name: p.functionCall.name,
        arguments: JSON.stringify(p.functionCall.args || {})
      }
    }));

  const content = parts.map((p) => p.text || '').join('');

  return { provider: 'gemini', content, toolCalls };
}
