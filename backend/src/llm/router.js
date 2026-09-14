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

export async function chat({ messages, tools }) {
  const order = getOrder();
  const errors = [];

  for (const name of order) {
    try {
      return await PROVIDERS[name]({ messages, tools });
    } catch (err) {
      errors.push(`${name}: ${err.message}`);
    }
  }

  throw new Error(
    `All AI providers failed or are unconfigured.\n${errors.join('\n')}\n\n` +
      'Add at least one free API key to backend/.env, or install Ollama locally.'
  );
}

export function listProviders() {
  return Object.keys(PROVIDERS);
}
