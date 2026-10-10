import {
  callGroq,
  callOpenRouter,
  callHuggingFace,
  callTogether,
  callMistral,
  callDeepSeek,
  callNvidia,
  callPerplexity,
  callGithubModels,
  callCerebras
} from './providers/openaiCompatibleList.js';
import { callGemini } from './providers/gemini.js';
import { callOllama } from './providers/ollama.js';
import { callCohere } from './providers/cohere.js';
import { callCloudflare } from './providers/cloudflare.js';

// 13 free/free-tier AI backends. Sumika tries them in PROVIDER_ORDER and
// falls through to the next one on any failure (no key set, rate limited, offline, etc).
const PROVIDERS = {
  groq: callGroq,
  gemini: callGemini,
  openrouter: callOpenRouter,
  huggingface: callHuggingFace,
  together: callTogether,
  mistral: callMistral,
  deepseek: callDeepSeek,
  nvidia: callNvidia,
  perplexity: callPerplexity,
  github: callGithubModels,
  cerebras: callCerebras,
  cohere: callCohere,
  cloudflare: callCloudflare,
  ollama: callOllama
};

function getOrder() {
  const configured = (
    process.env.PROVIDER_ORDER ||
    'groq,cerebras,gemini,openrouter,together,mistral,deepseek,nvidia,huggingface,perplexity,github,cohere,cloudflare,ollama'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return configured.filter((name) => PROVIDERS[name]);
}

// Free tiers cap tokens per MINUTE, and a multi-step job (one call per step)
// can brush against that within a single instruction. The provider says how
// long to wait ("try again in 3.0s", "retry in 21s"); when every provider is
// momentarily limited, waiting that out beats failing the user's whole request.
const MAX_WAIT_MS = 35000;
const ROUNDS = 4;

function retryAfterMs(message) {
  const m = message.match(/(?:try again|retry) in ([\d.]+)\s*(ms|s)\b/i) || message.match(/"retryDelay":\s*"([\d.]+)()s"/i);
  if (!m) return 0;
  const ms = m[2] === 'ms' ? Number(m[1]) : Number(m[1]) * 1000;
  return ms <= MAX_WAIT_MS ? ms : 0;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function chat({ messages, tools }) {
  const order = getOrder();
  let errors = [];

  for (let round = 0; round < ROUNDS; round += 1) {
    errors = [];
    let shortestWait = 0;

    for (const name of order) {
      try {
        return await PROVIDERS[name]({ messages, tools });
      } catch (err) {
        errors.push(`${name}: ${err.message}`);
        const wait = retryAfterMs(err.message);
        if (wait && (!shortestWait || wait < shortestWait)) shortestWait = wait;
      }
    }

    if (!shortestWait || round === ROUNDS - 1) break;
    await sleep(shortestWait + 400);
  }

  throw new Error(
    `All AI providers failed or are unconfigured.\n${errors.join('\n')}\n\n` +
      'Add at least one free API key to backend/.env, or install Ollama locally.'
  );
}

export function listProviders() {
  return Object.keys(PROVIDERS);
}
