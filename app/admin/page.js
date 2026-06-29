'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

const DEFAULTS = {
  siteName: '市役所AIチャットボット',
  siteUrl: 'https://www.city.izumiotsu.lg.jp/index.html',
  welcomeMessage: 'ご質問をどうぞ。市のWebサイトをGoogle検索でリアルタイムに調べて、丁寧にお答えします。',
};

function generateIframeCode(deployUrl, width, height) {
  return `<!-- 市役所AIチャットボット（インライン埋め込み） -->
<iframe
  src="${deployUrl}"
  width="${width}"
  height="${height}"
  frameborder="0"
  allow="clipboard-write"
  title="AIチャットボット"
  style="border-radius:12px; box-shadow:0 4px 20px rgba(0,0,0,0.12);"
></iframe>`.trim();
}

function generateWidgetCode(deployUrl, btnLabel) {
  return `<!-- 市役所AIチャットボット（フローティングウィジェット） -->
<div id="city-ai-widget">
  <button id="city-ai-btn" onclick="cityAiToggle()" aria-label="AIチャットボット">
    💬 ${btnLabel}
  </button>
  <div id="city-ai-panel" style="display:none;" role="dialog" aria-label="AIチャットボット">
    <div id="city-ai-titlebar">
      <span>🏛️ AIチャットボット</span>
      <button onclick="cityAiToggle()" aria-label="閉じる">✕</button>
    </div>
    <iframe src="${deployUrl}" frameborder="0" title="AIチャットボット" allow="clipboard-write"></iframe>
  </div>
</div>
<style>
  #city-ai-btn {
    position: fixed; bottom: 28px; right: 28px; z-index: 9998;
    background: #1a3a6b; color: #fff;
    border: none; border-radius: 50px;
    padding: 14px 22px; font-size: 15px; font-weight: bold;
    cursor: pointer; box-shadow: 0 4px 16px rgba(0,0,0,0.25);
    font-family: 'Hiragino Sans', 'Meiryo', sans-serif;
    transition: background 0.2s, transform 0.1s;
  }
  #city-ai-btn:hover { background: #2d5aa0; transform: translateY(-2px); }
  #city-ai-panel {
    position: fixed; bottom: 90px; right: 28px; z-index: 9999;
    width: 400px; height: 620px;
    border-radius: 14px; overflow: hidden;
    box-shadow: 0 8px 40px rgba(0,0,0,0.22);
    display: flex; flex-direction: column;
  }
  #city-ai-titlebar {
    background: #1a3a6b; color: #fff;
    padding: 10px 16px;
    display: flex; justify-content: space-between; align-items: center;
    font-size: 14px; font-weight: bold;
    font-family: 'Hiragino Sans', 'Meiryo', sans-serif;
  }
  #city-ai-titlebar button {
    background: none; border: none; color: #fff;
    font-size: 16px; cursor: pointer; line-height: 1;
  }
  #city-ai-panel iframe { flex: 1; width: 100%; }
  @media (max-width: 480px) {
    #city-ai-panel { width: calc(100vw - 20px); right: 10px; bottom: 80px; }
  }
</style>
<script>
  function cityAiToggle() {
    var p = document.getElementById('city-ai-panel');
    p.style.display = p.style.display === 'none' ? 'flex' : 'none';
  }
</script>`.trim();
}

export default function AdminPage() {
  const [form, setForm] = useState(DEFAULTS);
  const [saved, setSaved] = useState(false);
  const [apiKeyOk, setApiKeyOk] = useState(null);

  // Embed settings
  const [deployUrl, setDeployUrl] = useState('');
  const [embedType, setEmbedType] = useState('widget'); // 'iframe' | 'widget'
  const [iframeWidth, setIframeWidth] = useState('100%');
  const [iframeHeight, setIframeHeight] = useState('700px');
  const [btnLabel, setBtnLabel] = useState('AIに質問する');
  const [copied, setCopied] = useState(false);
  const codeRef = useRef(null);

  useEffect(() => {
    const saved = localStorage.getItem('chatbot_config');
    if (saved) {
      try { setForm(f => ({ ...DEFAULTS, ...JSON.parse(saved) })); } catch (_) {}
    }
    const embedSaved = localStorage.getItem('chatbot_embed');
    if (embedSaved) {
      try {
        const e = JSON.parse(embedSaved);
        if (e.deployUrl) setDeployUrl(e.deployUrl);
        if (e.embedType) setEmbedType(e.embedType);
        if (e.iframeWidth) setIframeWidth(e.iframeWidth);
        if (e.iframeHeight) setIframeHeight(e.iframeHeight);
        if (e.btnLabel) setBtnLabel(e.btnLabel);
      } catch (_) {}
    } else if (typeof window !== 'undefined') {
      setDeployUrl(window.location.origin);
    }
    fetch('/api/status').then(r => r.json()).then(d => setApiKeyOk(d.ok)).catch(() => setApiKeyOk(false));
  }, []);

  const handleChange = (field) => (e) => {
    setForm(f => ({ ...f, [field]: e.target.value }));
    setSaved(false);
  };

  const handleSave = (e) => {
    e.preventDefault();
    localStorage.setItem('chatbot_config', JSON.stringify(form));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleReset = () => {
    setForm(DEFAULTS);
    localStorage.removeItem('chatbot_config');
    setSaved(false);
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const embedCode = embedType === 'iframe'
    ? generateIframeCode(deployUrl || origin, iframeWidth, iframeHeight)
    : generateWidgetCode(deployUrl || origin, btnLabel);

  const handleEmbedChange = (setter) => (e) => {
    setter(e.target.value);
    localStorage.setItem('chatbot_embed', JSON.stringify({ deployUrl, embedType, iframeWidth, iframeHeight, btnLabel }));
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(embedCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <div className="admin-layout">
      <header className="admin-header">
        <h1>🛠️ 管理画面</h1>
        <Link href="/">チャット画面を開く →</Link>
      </header>

      <div className="admin-body">

        {/* API Status */}
        <div className="admin-card">
          <h2>システム状態</h2>
          <div className="form-group">
            <label>Gemini API キー</label>
            {apiKeyOk === null && <span style={{fontSize:'0.85rem', color:'#888'}}>確認中...</span>}
            {apiKeyOk === true && <span className="status-badge ok">✓ 設定済み（正常）</span>}
            {apiKeyOk === false && <span className="status-badge ng">✗ 未設定またはエラー</span>}
            <p className="hint">
              APIキーはVercelの環境変数「GEMINI_API_KEY」で管理します。
              変更は<a href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer" style={{color:'#2d5aa0'}}>Vercelダッシュボード</a>から行ってください。
            </p>
          </div>
        </div>

        {/* Settings */}
        <div className="admin-card">
          <h2>チャット画面の設定</h2>
          <form onSubmit={handleSave}>
            <div className="form-group">
              <label htmlFor="siteName">サイト名（ヘッダー表示）</label>
              <p className="hint">チャット画面の上部に表示されるタイトルです。</p>
              <input id="siteName" type="text" value={form.siteName}
                onChange={handleChange('siteName')} placeholder="例：〇〇市役所 AIチャットボット" />
            </div>
            <div className="form-group">
              <label htmlFor="siteUrl">対象サイトURL</label>
              <p className="hint">AIが参照する公式サイトのURLを入力してください。</p>
              <input id="siteUrl" type="url" value={form.siteUrl}
                onChange={handleChange('siteUrl')} placeholder="https://www.city.example.lg.jp/" />
            </div>
            <div className="form-group">
              <label htmlFor="welcomeMessage">ウェルカムメッセージ</label>
              <p className="hint">チャット画面を開いたときに表示される案内文です。</p>
              <textarea id="welcomeMessage" rows={4} value={form.welcomeMessage}
                onChange={handleChange('welcomeMessage')} placeholder="例：ご質問をどうぞ。" />
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="submit" className="save-btn">設定を保存</button>
              <button type="button" onClick={handleReset}
                style={{ background: 'none', border: '1px solid #d0d8e4', borderRadius: '8px', padding: '11px 20px', cursor: 'pointer', fontSize: '0.9rem', color: '#5a6a7e' }}>
                初期値に戻す
              </button>
              {saved && <div className="toast">✓ 保存しました</div>}
            </div>
          </form>
        </div>

        {/* Embed Code Generator */}
        <div className="admin-card">
          <h2>🔗 埋め込みコードの生成</h2>

          <div className="form-group">
            <label htmlFor="deployUrl">チャットボットのURL（Vercelの公開URL）</label>
            <p className="hint">Vercelにデプロイ後に発行されるURLを入力してください。</p>
            <input id="deployUrl" type="url" value={deployUrl}
              onChange={(e) => { setDeployUrl(e.target.value); }}
              placeholder="https://your-chatbot.vercel.app" />
          </div>

          <div className="form-group">
            <label>埋め込み方式</label>
            <div className="embed-type-row">
              <label className={`embed-type-btn ${embedType === 'widget' ? 'active' : ''}`}>
                <input type="radio" name="embedType" value="widget"
                  checked={embedType === 'widget'}
                  onChange={() => setEmbedType('widget')} />
                <span>💬 フローティングボタン</span>
                <small>右下に浮かぶボタン式。市のサイトのデザインを壊さない。</small>
              </label>
              <label className={`embed-type-btn ${embedType === 'iframe' ? 'active' : ''}`}>
                <input type="radio" name="embedType" value="iframe"
                  checked={embedType === 'iframe'}
                  onChange={() => setEmbedType('iframe')} />
                <span>🖼️ インライン埋め込み</span>
                <small>ページ内にチャット画面をそのまま表示する。</small>
              </label>
            </div>
          </div>

          {embedType === 'widget' && (
            <div className="form-group">
              <label htmlFor="btnLabel">ボタンのラベル文字</label>
              <input id="btnLabel" type="text" value={btnLabel}
                onChange={(e) => setBtnLabel(e.target.value)}
                placeholder="AIに質問する" style={{maxWidth:'280px'}} />
            </div>
          )}

          {embedType === 'iframe' && (
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <div className="form-group" style={{flex:1, minWidth:'120px'}}>
                <label htmlFor="iframeWidth">横幅</label>
                <input id="iframeWidth" type="text" value={iframeWidth}
                  onChange={(e) => setIframeWidth(e.target.value)}
                  placeholder="100%" />
              </div>
              <div className="form-group" style={{flex:1, minWidth:'120px'}}>
                <label htmlFor="iframeHeight">高さ</label>
                <input id="iframeHeight" type="text" value={iframeHeight}
                  onChange={(e) => setIframeHeight(e.target.value)}
                  placeholder="700px" />
              </div>
            </div>
          )}

          <div className="code-block-wrap">
            <div className="code-block-header">
              <span>HTMLコード</span>
              <button className="copy-btn" onClick={handleCopy}>
                {copied ? '✓ コピーしました' : 'コピー'}
              </button>
            </div>
            <pre className="code-block" ref={codeRef}><code>{embedCode}</code></pre>
          </div>

          <p className="hint" style={{marginTop:'12px'}}>
            ※ 上記コードを市のWebサイトのHTML（適切な場所）に貼り付けてください。<br/>
            CMSをお使いの場合は「HTMLブロック」や「カスタムHTML」から挿入できます。
          </p>
        </div>

        {/* Preview link */}
        <div className="admin-card">
          <h2>プレビュー</h2>
          <div style={{ marginTop: '4px' }}>
            <Link href="/"
              style={{ background: '#1a3a6b', color: '#fff', borderRadius: '8px', padding: '10px 22px', fontSize: '0.9rem', fontWeight: '700', textDecoration: 'none', display: 'inline-block' }}>
              チャット画面で確認 →
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
