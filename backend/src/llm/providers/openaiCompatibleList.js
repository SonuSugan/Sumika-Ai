import { makeOpenAICompatibleProvider } from '../openAICompatible.js';

// Every one of these has a free tier or is entirely free (Ollama).
// Add a key in backend/.env for whichever ones you want active - unset ones are skipped.
export const callGroq = makeOpenAICompatibleProvider({
  name: 'groq',
  baseUrl: 'https://api.groq.com/openai/v1',
  apiKeyEnv: 'GROQ_API_KEY',
  modelEnv: 'GROQ_MODEL',
  defaultModel: 'openai/gpt-oss-120b'
});

export const callOpenRouter = makeOpenAICompatibleProvider({
  name: 'openrouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKeyEnv: 'OPENROUTER_API_KEY',
  modelEnv: 'OPENROUTER_MODEL',
  defaultModel: 'meta-llama/llama-3.3-70b-instruct:free'
});

export const callHuggingFace = makeOpenAICompatibleProvider({
  name: 'huggingface',
  baseUrl: 'https://router.huggingface.co/v1',
  apiKeyEnv: 'HUGGINGFACE_API_KEY',
  modelEnv: 'HUGGINGFACE_MODEL',
  defaultModel: 'meta-llama/Llama-3.3-70B-Instruct'
});

export const callTogether = makeOpenAICompatibleProvider({
  name: 'together',
  baseUrl: 'https://api.together.xyz/v1',
  apiKeyEnv: 'TOGETHER_API_KEY',
  modelEnv: 'TOGETHER_MODEL',
  defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free'
});

export const callMistral = makeOpenAICompatibleProvider({
  name: 'mistral',
  baseUrl: 'https://api.mistral.ai/v1',
  apiKeyEnv: 'MISTRAL_API_KEY',
  modelEnv: 'MISTRAL_MODEL',
  defaultModel: 'mistral-small-latest'
});

export const callDeepSeek = makeOpenAICompatibleProvider({
  name: 'deepseek',
  baseUrl: 'https://api.deepseek.com',
  apiKeyEnv: 'DEEPSEEK_API_KEY',
  modelEnv: 'DEEPSEEK_MODEL',
  defaultModel: 'deepseek-chat'
});

export const callNvidia = makeOpenAICompatibleProvider({
  name: 'nvidia',
  baseUrl: 'https://integrate.api.nvidia.com/v1',
  apiKeyEnv: 'NVIDIA_API_KEY',
  modelEnv: 'NVIDIA_MODEL',
  defaultModel: 'meta/llama-3.3-70b-instruct'
});

export const callPerplexity = makeOpenAICompatibleProvider({
  name: 'perplexity',
  baseUrl: 'https://api.perplexity.ai',
  apiKeyEnv: 'PERPLEXITY_API_KEY',
  modelEnv: 'PERPLEXITY_MODEL',
  defaultModel: 'sonar'
});

export const callGithubModels = makeOpenAICompatibleProvider({
  name: 'github',
  baseUrl: 'https://models.inference.ai.azure.com',
  apiKeyEnv: 'GITHUB_TOKEN',
  modelEnv: 'GITHUB_MODEL',
  defaultModel: 'gpt-4o-mini'
});

export const callCerebras = makeOpenAICompatibleProvider({
  name: 'cerebras',
  baseUrl: 'https://api.cerebras.ai/v1',
  apiKeyEnv: 'CEREBRAS_API_KEY',
  modelEnv: 'CEREBRAS_MODEL',
  defaultModel: 'llama-3.3-70b'
});
