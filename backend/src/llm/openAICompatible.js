import fetch from 'node-fetch';

// Most free-tier AI APIs speak the same OpenAI-style chat completions shape.
// One factory covers all of them instead of duplicating fetch boilerplate per provider.
export function makeOpenAICompatibleProvider({ name, baseUrl, apiKeyEnv, modelEnv, defaultModel, headerName = 'Authorization', headerValue }) {
  return async function call({ messages, tools }) {
    const apiKey = process.env[apiKeyEnv];
    if (!apiKey) throw new Error(`${apiKeyEnv} not set`);

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [headerName]: headerValue ? headerValue(apiKey) : `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: process.env[modelEnv] || defaultModel,
        messages,
        ...(tools?.length ? { tools, tool_choice: 'auto' } : {})
      })
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${name} error ${res.status}: ${text}`);
    }

    const data = await res.json();
    const choice = data.choices[0].message;
    return { provider: name, content: choice.content || '', toolCalls: choice.tool_calls || [] };
  };
}
