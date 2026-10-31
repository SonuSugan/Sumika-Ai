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
- **Tools**: open desktop apps, open browser tabs/search, a Playwright-driven job-site
  browser that **pauses and pops up a request for your help** the moment it hits a CAPTCHA,
  login wall, or bot-check, instead of trying to bypass it - and **browser control**: Sumika
  can navigate, read, scroll, click, type, pick dropdown options and switch tabs in your
  real Chrome, following multi-step instructions (see below).

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

## Browser control (Chrome extension)

A web page can never reach into another tab, so driving your real Chrome takes a small
extension (`extension/`). It dials **out** to the backend over a WebSocket, so it works the
same against the Render backend as against a local one.

1. `chrome://extensions` -> Developer mode -> **Load unpacked** -> pick the `extension` folder
   (click the reload icon on its card after pulling changes).
2. **Deployed backend:** set `SUMIKA_ACCESS_TOKEN` on Render (any long random string). Without
   it browser control stays off, because the chat API is public and this lets whoever calls it
   read and click in your browser. Open Sumika, use the **Browser control** box, enter the
   code once - it checks it against the server and pairs the extension. Local backend: no
   code needed; the box pairs automatically on `localhost`.
3. Just talk: "open the pricing page, scroll to the bottom, click Contact, fill in my name".
   Sumika reads the page (a numbered list of links/buttons/fields), then acts on the numbers.

How it behaves:

- The extension connects only while a Sumika page is open, so a free-tier Render service isn't
  held awake and nothing is listening otherwise.
- It works on the page you were last on - never the Sumika tab itself - and opens a new tab
  for "open X".
- It never types into password/card/CVV/OTP/ID fields - you enter those. Final clicks
  (Submit, Send, Apply, Buy, Pay, Confirm, Place order, Delete) are held until you say yes: it
  tells you exactly what it is about to do and waits. The yes is recognised in code from your own
  next message and bound to that one button, so neither the model nor text on a web page can
  approve it. Text read from pages is treated as content, not commands.
- It can fill a whole form in one step, follow links that open new tabs, press Enter/Escape,
  go back/forward, and switch tabs.

## Teaching Sumika

- **Memory:** "remember that my address is..." keeps short facts (name, city, preferences) in
  your MongoDB (`memory` collection) and puts them in every prompt, so it can fill forms without
  asking again. Passwords, card and ID numbers are never stored. "Forget..." removes them.
- **Routines:** "learn this routine: when I say morning check, open Gmail and Calendar and tell
  me what's next", then just say "run my morning check".
- **Time and timers:** "what time is it", "set a 10 minute timer for the pasta" (the timer rings
  while the Sumika page is open).
- Memory, routines and the browser tools all need the access code on a deployed backend.
- Callers without the access code get a separate conversation, no browser tools, and see no
  page content on the shared WebSocket.
- Free-tier model providers cap tokens per minute (Groq's model: 8,000), and each step of a
  multi-step job is one model call, so long jobs take a minute or two; the backend waits out
  short rate limits instead of failing. Adding a Cerebras key (free, much higher limits) helps.

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
  names as `.env.example`), plus `SUMIKA_ACCESS_TOKEN` to enable browser control.
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
