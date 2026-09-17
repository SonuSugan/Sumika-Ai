# Sumika

A Jarvis-style voice assistant. React + styled-components UI, Node/Express backend,
free-tier AI providers with automatic fallback, and free browser-native voice I/O.

## Stack (100% free)

- **UI**: React + Vite + styled-components
- **Voice in/out**: Web Speech API (built into Chrome/Edge - no key, no cost)
- **Brain**: 14 configurable free AI backends, tried in order until one works:
  Groq, Cerebras, Google Gemini, OpenRouter, Together AI, Mistral, DeepSeek, NVIDIA NIM,
  Hugging Face, Perplexity, GitHub Models, Cohere, Cloudflare Workers AI, and local Ollama.
  You only need to set up *one* of these to get started - Groq's free tier is the fastest to set up.
- **Tools**: open desktop apps, open browser tabs/search, and a Playwright-driven job-site
  browser that **pauses and pops up a request for your help** the moment it hits a CAPTCHA,
  login wall, or bot-check, instead of trying to bypass it.

## Setup

```bash
npm run install:all
npx playwright install chromium --prefix backend
cp .env.example backend/.env
```

Edit `backend/.env` and add at least one API key (Groq is free and fast to get:
https://console.groq.com/keys). Or install [Ollama](https://ollama.com) and run
`ollama pull llama3.2` for a fully offline/local brain, no key needed.

## Run

```bash
npm run dev
```

Opens the backend on `http://localhost:5175` and the UI on `http://localhost:5173`
(Vite proxies `/api` and `/ws` to the backend). Use Chrome or Edge for voice input.

## Notes

- Job-site automation is deliberately hands-off around CAPTCHAs/logins - Sumika will
  open a visible browser window, pause, and show a popup asking you to clear the
  blocker yourself, then continue.
- All voice recognition/synthesis happens in the browser for free; no audio is ever
  uploaded anywhere.

## Deploying to the cloud

The frontend (static React build) and backend (Node/Express) can be deployed
separately - frontend to Vercel, backend to Render:

- **Render**: new Web Service from this repo, root directory `backend`,
  build command `npm install`, start command `node server.js`. Add your
  provider API keys as environment variables in the Render dashboard (same
  names as `.env.example`).
- **Vercel**: new project from this repo, root directory `frontend`, framework
  preset Vite. Set `VITE_BACKEND_URL` to your Render service's URL
  (e.g. `https://sumika-backend.onrender.com`).

**Important**: `open_app`, `browse_job_site`, and `apply_to_job` control the
machine Sumika's *backend* is running on. Deployed to Render, that's Render's
remote server, not your PC - so those reply with a friendly "I'm running in
the cloud" message instead of doing anything. For those (opening desktop apps,
browsing job sites in a visible window), run the backend locally.

`open_url` and `web_search` are different: they run client-side (the frontend
already executes in *your* browser, wherever the backend is hosted), so those
work the same whether you're using the local or deployed version.
