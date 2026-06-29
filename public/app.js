const chatContainer = document.getElementById('chat-container');
const form = document.getElementById('input-form');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const urlInput = document.getElementById('url-input');

// Load default URL
fetch('/api/default-url')
  .then(r => r.json())
  .then(d => { if (!urlInput.value) urlInput.value = d.url; });

// Submit on Enter (Shift+Enter for newline)
messageInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    form.requestSubmit();
  }
});

function addMessage(role, text) {
  const div = document.createElement('div');
  div.className = `message ${role}`;
  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  bubble.textContent = text;
  div.appendChild(bubble);
  chatContainer.appendChild(div);
  chatContainer.scrollTop = chatContainer.scrollHeight;
  return bubble;
}

function addStatus(text) {
  const bar = document.createElement('div');
  bar.className = 'status-bar';
  bar.innerHTML = `<div class="spinner"></div><span>${text}</span>`;
  chatContainer.appendChild(bar);
  chatContainer.scrollTop = chatContainer.scrollHeight;
  return bar;
}

function renderMarkdown(text) {
  // Basic markdown: ## headings, **bold**, [text](url)
  return text
    .replace(/## (.+)/g, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  const message = messageInput.value.trim();
  if (!message) return;

  // Clear welcome message on first send
  const welcome = chatContainer.querySelector('.welcome-message');
  if (welcome) welcome.remove();

  addMessage('user', message);
  messageInput.value = '';
  sendBtn.disabled = true;

  const statusBar = addStatus('URLをクロール中...');
  const aiBubble = addMessage('assistant', '').parentElement.querySelector('.message-bubble');
  let fullText = '';

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, url: urlInput.value || undefined }),
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop();

      for (const part of parts) {
        const lines = part.split('\n');
        let eventType = 'message';
        let dataLine = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) eventType = line.slice(7);
          if (line.startsWith('data: ')) dataLine = line.slice(6);
        }
        if (!dataLine) continue;

        const data = JSON.parse(dataLine);

        if (eventType === 'status') {
          statusBar.querySelector('span').textContent = data.message;
        } else if (eventType === 'delta') {
          fullText += data.text;
          aiBubble.innerHTML = renderMarkdown(fullText);
          chatContainer.scrollTop = chatContainer.scrollHeight;
        } else if (eventType === 'done') {
          statusBar.remove();
        } else if (eventType === 'error') {
          statusBar.remove();
          aiBubble.textContent = `エラー: ${data.message}`;
        }
      }
    }
  } catch (err) {
    statusBar.remove();
    aiBubble.textContent = `接続エラー: ${err.message}`;
  }

  sendBtn.disabled = false;
  messageInput.focus();
});
