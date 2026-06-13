/* SpaceTraders Agent — frontend */

let sessionId = sessionStorage.getItem('st-session-id');
let isStreaming = false;

// ── Boot ────────────────────────────────────────────────────────────────────

async function boot() {
  const res = await fetch('/api/config');
  const cfg = await res.json();

  if (cfg.configured) {
    showChat(cfg.agentSymbol);
  } else {
    document.getElementById('setup-screen').style.display = 'flex';
  }
}

function showChat(agentSymbol) {
  document.getElementById('setup-screen').style.display = 'none';
  document.getElementById('chat-screen').style.display = 'flex';

  if (agentSymbol) {
    const badge = document.getElementById('agent-badge');
    badge.textContent = agentSymbol;
    badge.style.display = 'block';
  }
}

// ── Registration ─────────────────────────────────────────────────────────────

document.getElementById('register-btn').addEventListener('click', async () => {
  const symbol = document.getElementById('setup-symbol').value.trim();
  if (!symbol) { alert('Please enter an agent callsign.'); return; }

  const btn = document.getElementById('register-btn');
  btn.disabled = true;
  btn.textContent = 'Registering…';

  try {
    // Registration goes through Claude — it calls the register_agent MCP tool
    showChat(null);
    sessionId = null;
    const faction = document.getElementById('setup-faction').value;
    const email = document.getElementById('setup-email').value.trim();

    const prompt = `Register a new SpaceTraders agent with callsign "${symbol}", faction "${faction}"${email ? `, email "${email}"` : ''}. Save the credentials and confirm success.`;
    await sendPrompt(prompt);
  } catch (err) {
    console.error(err);
    document.getElementById('setup-screen').style.display = 'flex';
    document.getElementById('chat-screen').style.display = 'none';
    btn.disabled = false;
    btn.textContent = 'Register Agent';
  }
});

// ── Sending prompts ───────────────────────────────────────────────────────────

document.getElementById('send-btn').addEventListener('click', submit);

document.getElementById('prompt-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    submit();
  }
});

// Auto-resize textarea
document.getElementById('prompt-input').addEventListener('input', function () {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 140) + 'px';
});

document.querySelectorAll('.quick-btn').forEach(btn => {
  btn.addEventListener('click', () => sendPrompt(btn.dataset.prompt));
});

function submit() {
  const input = document.getElementById('prompt-input');
  const text = input.value.trim();
  if (!text || isStreaming) return;
  input.value = '';
  input.style.height = 'auto';
  sendPrompt(text);
}

// ── Streaming ────────────────────────────────────────────────────────────────

async function sendPrompt(prompt) {
  if (isStreaming) return;
  setStreaming(true);

  appendUserMessage(prompt);
  const assistantEl = beginAssistantMessage();

  try {
    const res = await fetch('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, sessionId }),
    });

    if (!res.ok) {
      throw new Error(`Server error ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop(); // keep incomplete line

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') break;

        let event;
        try { event = JSON.parse(payload); } catch { continue; }
        handleEvent(event, assistantEl);
      }
    }
  } catch (err) {
    appendToAssistant(assistantEl, `\n⚠ Error: ${err.message}`);
  }

  finalizeAssistant(assistantEl);
  setStreaming(false);
  scrollToBottom();
}

function handleEvent(event, assistantEl) {
  switch (event.type) {
    case 'session':
      sessionId = event.sessionId;
      sessionStorage.setItem('st-session-id', sessionId);
      break;

    case 'text':
      appendToAssistant(assistantEl, event.content);
      scrollToBottom();
      break;

    case 'tool_use':
      appendToolCall(assistantEl, event.name, event.input, null);
      break;

    case 'tool_result':
      // Match result to last pending tool call
      updateLastToolResult(assistantEl, event.results);
      break;

    case 'batch':
      for (const e of event.events) handleEvent(e, assistantEl);
      break;

    case 'result':
      if (event.subtype === 'error') {
        appendToAssistant(assistantEl, '\n⚠ Agent encountered an error.');
      }
      break;

    case 'error':
      appendToAssistant(assistantEl, `\n⚠ ${event.message}`);
      break;

    case 'done':
      // Stream ended
      break;
  }
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

function appendUserMessage(text) {
  const msgs = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'msg user';
  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.textContent = text;
  div.appendChild(bubble);
  msgs.appendChild(div);
  scrollToBottom();
}

function beginAssistantMessage() {
  const msgs = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'msg assistant';

  // Thinking indicator
  const thinking = document.createElement('div');
  thinking.className = 'thinking';
  thinking.innerHTML = '<span>Claude is thinking</span><div class="dots"><span></span><span></span><span></span></div>';
  div.appendChild(thinking);

  msgs.appendChild(div);
  scrollToBottom();
  return div;
}

function appendToAssistant(msgEl, text) {
  // Remove thinking indicator on first text
  const thinking = msgEl.querySelector('.thinking');
  if (thinking) thinking.remove();

  let bubble = msgEl.querySelector('.msg-bubble');
  if (!bubble) {
    bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    msgEl.appendChild(bubble);
  }
  bubble.textContent += text;
}

function appendToolCall(msgEl, name, input, output) {
  // Remove thinking indicator
  const thinking = msgEl.querySelector('.thinking');
  if (thinking) thinking.remove();

  const wrapper = document.createElement('div');
  wrapper.className = 'tool-call';
  wrapper.dataset.toolPending = 'true';

  const header = document.createElement('div');
  header.className = 'tool-call-header';

  const icon = document.createElement('span');
  icon.className = 'tool-icon';
  icon.textContent = toolIcon(name);

  const nameEl = document.createElement('span');
  nameEl.className = 'tool-name';
  nameEl.textContent = name.replace('mcp__spacetraders__', '');

  const toggle = document.createElement('span');
  toggle.className = 'tool-toggle';
  toggle.textContent = '▸ show';

  header.appendChild(icon);
  header.appendChild(nameEl);
  header.appendChild(toggle);

  const body = document.createElement('div');
  body.className = 'tool-call-body';

  const pre = document.createElement('pre');
  pre.textContent = JSON.stringify(input, null, 2);
  body.appendChild(pre);

  header.addEventListener('click', () => {
    body.classList.toggle('open');
    toggle.textContent = body.classList.contains('open') ? '▾ hide' : '▸ show';
  });

  wrapper.appendChild(header);
  wrapper.appendChild(body);
  msgEl.appendChild(wrapper);
}

function updateLastToolResult(msgEl, results) {
  const pending = [...msgEl.querySelectorAll('.tool-call[data-tool-pending="true"]')].pop();
  if (!pending || !results?.length) return;
  delete pending.dataset.toolPending;

  const body = pending.querySelector('.tool-call-body');
  const pre = body.querySelector('pre');
  const resultText = results.map(r => r.content).join('\n');

  // Append result to body (collapsed by default)
  const resultDiv = document.createElement('div');
  resultDiv.style.cssText = 'margin-top:0.5rem;padding-top:0.5rem;border-top:1px solid #2d2d4e;';
  const resultPre = document.createElement('pre');
  resultPre.style.color = '#6ee7b7';
  // Truncate long results in the display
  const preview = resultText.length > 500 ? resultText.slice(0, 500) + '\n…' : resultText;
  resultPre.textContent = preview;
  resultDiv.appendChild(resultPre);
  body.appendChild(resultDiv);
}

function finalizeAssistant(msgEl) {
  const thinking = msgEl.querySelector('.thinking');
  if (thinking) {
    thinking.innerHTML = '<span style="color:#ef4444">No response</span>';
  }
}

function toolIcon(name) {
  if (name.includes('navigate')) return '🚀';
  if (name.includes('extract') || name.includes('mine')) return '⛏';
  if (name.includes('sell')) return '💰';
  if (name.includes('contract')) return '📋';
  if (name.includes('ship')) return '🛸';
  if (name.includes('register')) return '✨';
  if (name.includes('waypoint') || name.includes('system')) return '🌌';
  if (name.includes('dock')) return '🏗';
  if (name.includes('orbit')) return '🔄';
  if (name.includes('refuel')) return '⛽';
  return '🔧';
}

function setStreaming(val) {
  isStreaming = val;
  document.getElementById('send-btn').disabled = val;
  document.querySelectorAll('.quick-btn').forEach(b => b.disabled = val);
}

function scrollToBottom() {
  const msgs = document.getElementById('messages');
  msgs.scrollTop = msgs.scrollHeight;
}

// ── Init ─────────────────────────────────────────────────────────────────────
boot();
