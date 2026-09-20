import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { handleUserMessage, resetSession } from './src/agent.js';
import { helpBus, resolveHelp } from './src/tools/helpBus.js';
import { registerExtensionSocket, isExtensionConnected } from './src/tools/extensionBridge.js';
import { getProfile, saveProfile, saveResume } from './src/profile.js';

const app = express();
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });
app.use(cors());
app.use(express.json());

const server = createServer(app);
// noServer + one manual router below - `ws`'s own {server, path} convenience
// constructor makes EVERY WebSocketServer instance on the same http.Server
// react to EVERY upgrade request, and any instance whose path doesn't match
// actively responds 400 (not a silent skip) before the matching one gets a
// turn. With two servers ('/ws' and '/ext') that broke '/ext' entirely.
const wss = new WebSocketServer({ noServer: true });

const clients = new Set();
wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'resume_help') {
        resolveHelp(msg.id);
      }
    } catch {
      // ignore malformed client messages
    }
  });
});

// The Sumika Chrome extension connects here (separate from the UI's /ws
// channel above) so backend tools can ask it to navigate/scroll/click/read
// the user's actual, already-open Chrome - see src/tools/extensionBridge.js.
const extWss = new WebSocketServer({ noServer: true });
extWss.on('connection', (ws) => {
  console.log('[extension] connected');
  ws.on('close', () => console.log('[extension] disconnected'));
  registerExtensionSocket(ws);
});

server.on('upgrade', (request, socket, head) => {
  const { pathname } = new URL(request.url, `http://${request.headers.host}`);
  if (pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
  } else if (pathname === '/ext') {
    extWss.handleUpgrade(request, socket, head, (ws) => extWss.emit('connection', ws, request));
  } else {
    socket.destroy();
  }
});

function broadcast(payload) {
  const data = JSON.stringify(payload);
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) ws.send(data);
  }
}

// Whenever a tool hits a CAPTCHA/login/bot-check, push a popup event to every connected UI.
helpBus.on('blocked', (info) => {
  broadcast({ type: 'help_needed', ...info });
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/extension-status', (_req, res) => res.json({ connected: isExtensionConnected() }));

app.post('/api/chat', async (req, res) => {
  const { sessionId = 'default', message } = req.body;
  if (!message) return res.status(400).json({ error: 'message is required' });

  try {
    const result = await handleUserMessage(sessionId, message, (event) => {
      broadcast({ type: 'tool_event', sessionId, ...event });
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reset', (req, res) => {
  resetSession(req.body?.sessionId || 'default');
  res.json({ ok: true });
});

app.post('/api/resume-help', (req, res) => {
  const ok = resolveHelp(req.body?.id);
  res.json({ ok });
});

app.get('/api/profile', async (_req, res) => {
  try {
    const profile = await getProfile();
    res.json(profile || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/profile', async (req, res) => {
  try {
    const profile = await saveProfile(req.body || {});
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload (or re-upload) a resume - PDF gets text-extracted, plain text passes through.
// This is how Sumika "learns" your resume for job-application autofill and Q&A.
app.post('/api/profile/resume', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded (field name: resume)' });

    // Don't trust the client-supplied mimetype (some HTTP clients send generic
    // octet-stream for file uploads) - sniff the actual PDF magic bytes instead.
    const isPdf = req.file.buffer.slice(0, 5).toString('latin1') === '%PDF-' || /\.pdf$/i.test(req.file.originalname);

    let text;
    if (isPdf) {
      text = (await pdfParse(req.file.buffer)).text;
    } else {
      text = req.file.buffer.toString('utf-8');
    }

    const profile = await saveResume({ text, filename: req.file.originalname });
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5175;
server.listen(PORT, () => {
  console.log(`Sumika backend listening on http://localhost:${PORT}`);
});
