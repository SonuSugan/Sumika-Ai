import fetch from 'node-fetch';

// Google Gemini free tier. https://aistudio.google.com/app/apikey
// Gemini's native tool-call schema differs from OpenAI's, so we translate both ways.
//
// Conversation history is shared by every provider (any of them may answer the
// next step), so it arrives in OpenAI shape and is rebuilt here as real Gemini
// functionCall / functionResponse parts. Describing tool calls as plain text
// instead makes Gemini copy that text as its own answer rather than calling tools.

// Gemini 3 wants the "thought signature" it returned with a function call echoed
// back on later turns; calls that came from another provider have none, and
// this documented placeholder is how Google says to satisfy the check for those.
const NO_SIGNATURE = 'skip_thought_signature_validator';

function toContents(rest) {
  const contents = [];
  let pendingNames = [];

  for (const m of rest) {
    if (m.role === 'assistant' && m.tool_calls?.length) {
      pendingNames = m.tool_calls.map((c) => c.function.name);
      const parts = [];
      if (m.content) parts.push({ text: m.content });
      for (const c of m.tool_calls) {
        let args = {};
        try {
          args = JSON.parse(c.function.arguments || '{}');
        } catch {
          args = {};
        }
        parts.push({ functionCall: { name: c.function.name, args }, thoughtSignature: c.thoughtSignature || NO_SIGNATURE });
      }
      contents.push({ role: 'model', parts });
    } else if (m.role === 'tool') {
      let response;
      try {
        response = JSON.parse(m.content);
      } catch {
        response = { result: m.content };
      }
      if (response === null || typeof response !== 'object' || Array.isArray(response)) response = { result: response };
      const part = { functionResponse: { name: pendingNames.shift() || 'tool', response } };
      const last = contents[contents.length - 1];
      // All results for one round of calls go back together in a single turn.
      if (last?.role === 'user' && last.parts.every((p) => p.functionResponse)) last.parts.push(part);
      else contents.push({ role: 'user', parts: [part] });
    } else {
      contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content || ' ' }] });
    }
  }
  return contents;
}

export async function callGemini({ messages, tools }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');
  const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

  const systemMsg = messages.find((m) => m.role === 'system');
  const contents = toContents(messages.filter((m) => m.role !== 'system'));

  const geminiTools = tools?.length
    ? [{
        functionDeclarations: tools.map((t) => {
          const hasParams = Object.keys(t.function.parameters?.properties || {}).length > 0;
          return {
            name: t.function.name,
            description: t.function.description,
            // Gemini rejects an object schema with no properties - omit it instead.
            ...(hasParams ? { parameters: t.function.parameters } : {})
          };
        })
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

  // Ids must be unique across the whole conversation: a later round's
  // "call_0" would otherwise collide with an earlier one.
  const stamp = Date.now().toString(36);
  const toolCalls = parts
    .filter((p) => p.functionCall)
    .map((p, i) => ({
      id: `gemini_${stamp}_${i}`,
      type: 'function',
      function: {
        name: p.functionCall.name,
        arguments: JSON.stringify(p.functionCall.args || {})
      },
      ...(p.thoughtSignature ? { thoughtSignature: p.thoughtSignature } : {})
    }));

  const content = parts.map((p) => p.text || '').join('');

  return { provider: 'gemini', content, toolCalls };
}
