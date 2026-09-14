import fetch from 'node-fetch';

// Cloudflare Workers AI free tier (generous daily free neuron allowance).
export async function callCloudflare({ messages }) {
  const apiKey = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!apiKey || !accountId) throw new Error('CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID not set');

  const model = process.env.CLOUDFLARE_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({ messages })
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cloudflare error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return { provider: 'cloudflare', content: data.result?.response || '', toolCalls: [] };
}
