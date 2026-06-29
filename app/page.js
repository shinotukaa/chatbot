'use client';

import { useState, useRef, useEffect } from 'react';

function renderMarkdown(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/## (.+)/g, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(https?:\/\/[^\s<&]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    .replace(/\n/g, '<br>');
}

export default function Home() {
  const [messages, setMessages] = useState([]);
  const [url, setUrl] = useState('');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const chatRef = useRef(null);

  useEffect(() => {
    fetch('/api/default-url').then(r => r.json()).then(d => setUrl(d.url));
  }, []);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, status]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const message = input.trim();
    if (!message || loading) return;

    setMessages(prev => [...prev, { role: 'user', text: message }]);
    setInput('');
    setLoading(true);
    setStatus('クロール中...');

    const aiIndex = messages.length + 1;
    setMessages(prev => [...prev, { role: 'assistant', text: '', html: '' }]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, url: url || undefined }),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop();

        for (const part of parts) {
          const lines = part.split('\n');
          let eventType = 'message', dataLine = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) eventType = line.slice(7);
            if (line.startsWith('data: ')) dataLine = line.slice(6);
          }
          if (!dataLine) continue;
          const data = JSON.parse(dataLine);

          if (eventType === 'status') {
            setStatus(data.message);
          } else if (eventType === 'delta') {
            fullText += data.text;
            setMessages(prev => prev.map((m, i) =>
              i === aiIndex ? { ...m, html: renderMarkdown(fullText) } : m
            ));
          } else if (eventType === 'done' || eventType === 'error') {
            setStatus('');
            if (eventType === 'error') {
              setMessages(prev => prev.map((m, i) =>
                i === aiIndex ? { ...m, text: `エラー: ${data.message}`, html: '' } : m
              ));
            }
          }
        }
      }
    } catch (err) {
      setStatus('');
      setMessages(prev => prev.map((m, i) =>
        i === aiIndex ? { ...m, text: `接続エラー: ${err.message}`, html: '' } : m
      ));
    }

    setLoading(false);
  };

  return (
    <div className="app">
      <header className="header">
        <h1>市役所AIチャットボット</h1>
        <p className="subtitle">市のWebサイトを検索してお答えします</p>
      </header>

      <div className="url-bar">
        <label htmlFor="url">参照URL</label>
        <input
          id="url"
          type="url"
          className="url-input"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://..."
        />
      </div>

      <div className="chat-container" ref={chatRef}>
        {messages.length === 0 && (
          <div className="welcome">
            <p>ご質問をどうぞ。市のWebサイトをリアルタイムで調べてお答えします。</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`message ${m.role}`}>
            <div
              className="bubble"
              {...(m.html
                ? { dangerouslySetInnerHTML: { __html: m.html } }
                : {})}
            >
              {!m.html && m.text}
            </div>
          </div>
        ))}
        {status && (
          <div className="status-bar">
            <div className="spinner" />
            <span>{status}</span>
          </div>
        )}
      </div>

      <form className="input-form" onSubmit={handleSubmit}>
        <textarea
          className="message-input"
          rows={3}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); }
          }}
          placeholder="例: 工事入札の申請資格を教えてください"
          disabled={loading}
        />
        <button type="submit" className="send-btn" disabled={loading}>送信</button>
      </form>
    </div>
  );
}
