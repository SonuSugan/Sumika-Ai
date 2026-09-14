import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { handleUserMessage, resetSession } from './src/agent.js';
import { helpBus, resolveHelp } from './src/tools/helpBus.js';

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

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

const PORT = process.env.PORT || 5175;
server.listen(PORT, () => {
  console.log(`Sumika backend listening on http://localhost:${PORT}`);
});
