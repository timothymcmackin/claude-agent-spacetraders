import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getConfig } from './spacetraders-api.js';
import { runAgent } from './agent.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());
app.use(express.static(join(__dirname, '..', 'public')));

// Returns whether an agent is configured and its symbol if so
app.get('/api/config', async (_req, res) => {
  try {
    const config = await getConfig();
    if (config?.token) {
      res.json({ configured: true, agentSymbol: config.agentSymbol ?? null });
    } else {
      res.json({ configured: false });
    }
  } catch {
    res.json({ configured: false });
  }
});

// Main endpoint: POST prompt, receive SSE stream of agent events
app.post('/api/query', async (req, res) => {
  const { prompt, sessionId } = req.body ?? {};
  if (!prompt) {
    return res.status(400).json({ error: 'prompt is required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const write = (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    let resolvedSessionId = sessionId ?? null;

    for await (const message of runAgent(prompt, sessionId ?? null)) {
      // Capture session ID from the SDK init message
      if (message.type === 'system' && message.subtype === 'init') {
        resolvedSessionId = message.session_id ?? resolvedSessionId;
        write({ type: 'session', sessionId: resolvedSessionId });
        continue;
      }

      const event = toClientEvent(message);
      if (event) write(event);
    }
  } catch (err) {
    write({ type: 'error', message: err.message });
  }

  write({ type: 'done' });
  res.end();
});

function toClientEvent(message) {
  if (message.type === 'assistant') {
    const content = message.message?.content ?? [];
    const events = [];
    for (const block of content) {
      if (block.type === 'text') {
        events.push({ type: 'text', content: block.text });
      } else if (block.type === 'tool_use') {
        events.push({ type: 'tool_use', name: block.name, input: block.input });
      }
    }
    if (events.length === 0) return null;
    if (events.length === 1) return events[0];
    return { type: 'batch', events };
  }

  if (message.type === 'result') {
    return { type: 'result', subtype: message.subtype };
  }

  // Tool results come through as user messages in some SDK versions
  if (message.type === 'user') {
    const content = message.message?.content ?? [];
    const results = content.filter(b => b.type === 'tool_result');
    if (results.length === 0) return null;
    return {
      type: 'tool_result',
      results: results.map(r => ({
        toolUseId: r.tool_use_id,
        content: Array.isArray(r.content)
          ? r.content.map(c => c.text ?? '').join('')
          : r.content ?? '',
      })),
    };
  }

  return null;
}

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  console.log(`SpaceTraders agent running at http://localhost:${PORT}`);
});
