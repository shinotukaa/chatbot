'use client';

import { useState, useRef, useEffect } from 'react';

const DEFAULT_CONFIG = {
  siteName: '市役所AIチャットボット',
  siteUrl: '',
  welcomeMessage: 'ご質問をどうぞ。市のWebサイトを直接調べて、丁寧にお答えします。',
  characterName: '',
  characterImageUrl: '',
};


function renderMarkdown(text) {
  const escaped = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/## (.+)/g, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Single pass over markdown links and bare URLs so a bare-URL match
  // never re-wraps a URL already placed inside an href="..." attribute.
  const linked = escaped.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s<&]+)/g,
    (match, linkText, linkUrl, bareUrl) => {
      if (linkUrl) return `<a href="${linkUrl}" target="_blank" rel="noopener">${linkText}</a>`;
      return `<a href="${bareUrl}" target="_blank" rel="noopener">${bareUrl}</a>`;
    }
  );

  return linked.replace(/\n/g, '<br>');
}

export default function Home() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const chatRef = useRef(null);

  useEffect(() => {
    // Load config from server-side environment variables
    fetch('/api/config')
      .then(r => r.json())
      .then(d => setConfig(c => ({ ...c, ...d })))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, status]);

  const targetUrl = config.siteUrl;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const message = input.trim();
    if (!message || loading) return;

    setMessages(prev => [...prev, { role: 'user', text: message }]);
    setInput('');
    setLoading(true);
    setStatus('市役所サイトを確認中...');

    const aiIndex = messages.length + 1;
    setMessages(prev => [...prev, { role: 'assistant', text: '', html: '', sources: [], searchEntryPoint: null }]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, url: targetUrl || undefined }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      if (!res.body) {
        throw new Error('ストリーミング応答を受信できませんでした。');
      }

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
            if (line.startsWith('data: ')) dataLine += (dataLine ? '\n' : '') + line.slice(6);
          }
          if (!dataLine) continue;

          let data;
          try {
            data = JSON.parse(dataLine);
          } catch {
            continue;
          }

          if (eventType === 'status') {
            setStatus(data.message || '');
          } else if (eventType === 'delta') {
            fullText += data.text || '';
            // USED_PAGES:タグを表示から除去
            const displayText = fullText.replace(/\s*USED_PAGES:\[[\s\S]*?\]/, '');
            setMessages(prev => prev.map((m, i) =>
              i === aiIndex ? { ...m, html: renderMarkdown(displayText) } : m
            ));
          } else if (eventType === 'done') {
            setStatus('');
            setMessages(prev => prev.map((m, i) =>
              i === aiIndex ? { ...m, sources: Array.isArray(data.sources) ? data.sources : [], searchEntryPoint: data.searchEntryPoint || null } : m
            ));
          } else if (eventType === 'error') {
            setStatus('');
            setMessages(prev => prev.map((m, i) =>
              i === aiIndex ? { ...m, text: `エラー: ${data.message || '不明なエラーが発生しました。'}`, html: '' } : m
            ));
          }
        }
      }
    } catch (err) {
      setStatus('');
      setMessages(prev => prev.map((m, i) =>
        i === aiIndex ? { ...m, text: `エラー: ${err.message}`, html: '' } : m
      ));
    }

    setLoading(false);
  };

  return (
    <div className="chat-layout">
      <header className="site-header">
        <div className="header-inner">
          {config.characterImageUrl ? (
            <img src={config.characterImageUrl} alt={config.characterName || 'キャラクター'} className="header-character" />
          ) : (
            <div className="header-icon">🏛️</div>
          )}
          <div className="header-text">
            <h1>{config.siteName}</h1>
            <p>AIがWebサイトを検索して、ご質問にお答えします</p>
          </div>
        </div>
      </header>

      {targetUrl && (
        <div className="search-info">
          🔍 検索対象：
          <a href={targetUrl} target="_blank" rel="noopener noreferrer">{targetUrl}</a>
        </div>
      )}

      <div className="chat-body" ref={chatRef}>
        <div className="welcome-card">
          <strong>ご利用案内</strong><br />
          {config.welcomeMessage}
        </div>

        {messages.map((m, i) => (
          <div key={i} className={`message ${m.role}`}>
            {m.role === 'assistant' && (
              <div className="assistant-avatar">
                {config.characterImageUrl ? (
                  <img src={config.characterImageUrl} alt={config.characterName || 'AI'} className="avatar-img" />
                ) : (
                  <div className="avatar-icon">🏛️</div>
                )}
                <span className="avatar-name">{config.characterName || 'AIアシスタント'}</span>
              </div>
            )}
            {m.role === 'user' && (
              <div className="message-label">市民</div>
            )}
            {m.html ? (
              <div className="bubble" dangerouslySetInnerHTML={{ __html: m.html }} />
            ) : (
              <div className="bubble">{m.text}</div>
            )}

            {m.role === 'assistant' && m.searchEntryPoint && (
              <div className="search-entry-point"
                dangerouslySetInnerHTML={{ __html: m.searchEntryPoint }} />
            )}

            {m.role === 'assistant' && m.sources?.length > 0 && (
              <div className="sources-box">
                <p className="sources-title">参考ページ</p>
                <ul className="sources-list">
                  {m.sources.map(s => (
                    <li key={s.index}>
                      <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}

        {status && (
          <div className="status-bar">
            <div className="spinner" />
            <span>{status}</span>
          </div>
        )}
      </div>

      <div className="chat-footer">
        <form onSubmit={handleSubmit}>
          <div className="input-row">
            <textarea
              className="message-input"
              rows={3}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); }
              }}
              placeholder="例：工事入札の申請資格を教えてください"
              disabled={loading}
            />
            <button type="submit" className="send-btn" disabled={loading}>送信</button>
          </div>
          <p className="input-hint">Enterで送信　Shift+Enterで改行</p>
        </form>
      </div>

      <footer className="site-footer">
        本サービスはAIによる自動回答です。最終的な確認は市の公式窓口へお問い合わせください。
      </footer>
    </div>
  );
}
