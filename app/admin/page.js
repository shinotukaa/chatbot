'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

function generateIframeCode(deployUrl, width, height) {
  return `<!-- 市役所AIチャットボット（インライン埋め込み） -->
<iframe
  id="city-ai-iframe"
  src="${deployUrl}"
  width="${width}"
  height="${height}"
  frameborder="0"
  allow="clipboard-write"
  title="AIチャットボット"
  style="border-radius:12px; box-shadow:0 4px 20px rgba(0,0,0,0.12); transition: height 0.3s ease;"
></iframe>
<script>
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'chatbot-resize') {
      var f = document.getElementById('city-ai-iframe');
      if (f) f.style.height = e.data.height + 'px';
    }
  });
</script>`.trim();
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

const ENV_VARS = [
  { key: 'GEMINI_API_KEY',      label: 'Gemini APIキー',                  example: 'AIza...',                             secret: true },
  { key: 'SITE_NAME',           label: 'サイト名（ヘッダー）',             example: '〇〇市役所 AIチャットボット',          secret: false },
  { key: 'DEFAULT_URL',         label: '対象サイトURL',                     example: 'https://www.city.example.lg.jp/',    secret: false },
  { key: 'WELCOME_MESSAGE',     label: 'ウェルカムメッセージ',              example: 'ご質問をどうぞ。...',                  secret: false },
  { key: 'SERP_API_KEY',         label: 'SerpAPI キー（任意）',             example: '',                                    secret: true },
  { key: 'CHARACTER_NAME',      label: 'キャラクター名（任意）',            example: 'ミネドン',                             secret: false },
  { key: 'CHARACTER_IMAGE_URL', label: 'キャラクター画像URL（任意）',       example: 'https://example.com/chara.png',       secret: false },
];

export default function AdminPage() {
  const [serverConfig, setServerConfig] = useState(null);
  const [apiKeyOk, setApiKeyOk] = useState(null);

  // Embed settings (UI only — no server state needed)
  const [deployUrl, setDeployUrl] = useState('');
  const [embedType, setEmbedType] = useState('widget');
  const [iframeWidth, setIframeWidth] = useState('100%');
  const [iframeHeight, setIframeHeight] = useState('700px');
  const [btnLabel, setBtnLabel] = useState('AIに質問する');
  const [copied, setCopied] = useState(false);
  const codeRef = useRef(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setDeployUrl(window.location.origin);
    }
    fetch('/api/config').then(r => r.json()).then(setServerConfig).catch(() => {});
    fetch('/api/status').then(r => r.json()).then(d => setApiKeyOk(d.ok)).catch(() => setApiKeyOk(false));
  }, []);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const embedCode = embedType === 'iframe'
    ? generateIframeCode(deployUrl || origin, iframeWidth, iframeHeight)
    : generateWidgetCode(deployUrl || origin, btnLabel);

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

        {/* 現在の設定確認 */}
        <div className="admin-card">
          <h2>現在の設定（サーバー反映値）</h2>
          <p style={{fontSize:'0.82rem', color:'#5a6a7e', marginBottom:'16px', lineHeight:'1.6'}}>
            以下はVercelの環境変数から読み込まれた実際の設定値です。<br/>
            変更する場合は下の「設定変更の手順」を参照してください。
          </p>

          <table className="config-table">
            <tbody>
              <tr>
                <th>Gemini APIキー</th>
                <td>
                  {apiKeyOk === null && <span style={{color:'#888'}}>確認中...</span>}
                  {apiKeyOk === true  && <span className="status-badge ok">✓ 設定済み</span>}
                  {apiKeyOk === false && <span className="status-badge ng">✗ 未設定</span>}
                </td>
              </tr>
              <tr>
                <th>サイト名</th>
                <td>{serverConfig?.siteName ?? '読み込み中...'}</td>
              </tr>
              <tr>
                <th>対象サイトURL</th>
                <td><a href={serverConfig?.siteUrl} target="_blank" rel="noopener noreferrer">{serverConfig?.siteUrl ?? '読み込み中...'}</a></td>
              </tr>
              <tr>
                <th>ウェルカムメッセージ</th>
                <td style={{whiteSpace:'pre-wrap'}}>{serverConfig?.welcomeMessage ?? '読み込み中...'}</td>
              </tr>
            </tbody>
          </table>

          <div style={{marginTop:'16px'}}>
            <Link href="/" style={{background:'#1a3a6b', color:'#fff', borderRadius:'8px', padding:'9px 20px', fontSize:'0.88rem', fontWeight:'700', textDecoration:'none', display:'inline-block'}}>
              チャット画面で確認 →
            </Link>
          </div>
        </div>

        {/* 設定変更の手順 */}
        <div className="admin-card">
          <h2>設定変更の手順</h2>
          <p style={{fontSize:'0.82rem', color:'#5a6a7e', marginBottom:'16px', lineHeight:'1.6'}}>
            設定はVercelの環境変数で管理します。変更するとすべての利用者に即時反映されます。
          </p>

          <ol className="steps-list">
            <li><a href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer">Vercelダッシュボード</a> を開く</li>
            <li>対象プロジェクト → <strong>Settings</strong> → <strong>Environment Variables</strong> を開く</li>
            <li>以下の環境変数を追加・編集する</li>
            <li><strong>Deployments</strong> から最新をRedeploy（または次のpushで自動反映）</li>
          </ol>

          <table className="config-table" style={{marginTop:'14px'}}>
            <thead>
              <tr><th>環境変数名</th><th>内容</th><th>設定例</th></tr>
            </thead>
            <tbody>
              {ENV_VARS.map(v => (
                <tr key={v.key}>
                  <td><code className="env-key">{v.key}</code></td>
                  <td style={{fontSize:'0.82rem'}}>{v.label}</td>
                  <td style={{fontSize:'0.8rem', color: v.secret ? '#c0392b' : '#5a6a7e'}}>
                    {v.secret ? '（機密情報）' : v.example}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 埋め込みコード生成 */}
        <div className="admin-card">
          <h2>🔗 埋め込みコードの生成</h2>

          <div className="form-group">
            <label htmlFor="deployUrl">チャットボットのURL（VercelのデプロイURL）</label>
            <p className="hint">Vercelにデプロイ後に発行されるURLを入力してください。</p>
            <input id="deployUrl" type="url" value={deployUrl}
              onChange={e => setDeployUrl(e.target.value)}
              placeholder="https://your-chatbot.vercel.app" />
          </div>

          <div className="form-group">
            <label>埋め込み方式</label>
            <div className="embed-type-row">
              <label className={`embed-type-btn ${embedType === 'widget' ? 'active' : ''}`}>
                <input type="radio" name="embedType" value="widget"
                  checked={embedType === 'widget'} onChange={() => setEmbedType('widget')} />
                <span>💬 フローティングボタン</span>
                <small>右下に浮かぶボタン式。既存サイトのデザインを崩さない。</small>
              </label>
              <label className={`embed-type-btn ${embedType === 'iframe' ? 'active' : ''}`}>
                <input type="radio" name="embedType" value="iframe"
                  checked={embedType === 'iframe'} onChange={() => setEmbedType('iframe')} />
                <span>🖼️ インライン埋め込み</span>
                <small>ページ内にチャット画面をそのまま表示する。</small>
              </label>
            </div>
          </div>

          {embedType === 'widget' && (
            <div className="form-group">
              <label htmlFor="btnLabel">ボタンのラベル文字</label>
              <input id="btnLabel" type="text" value={btnLabel}
                onChange={e => setBtnLabel(e.target.value)}
                placeholder="AIに質問する" style={{maxWidth:'280px'}} />
            </div>
          )}

          {embedType === 'iframe' && (
            <div style={{display:'flex', gap:'16px', flexWrap:'wrap'}}>
              <div className="form-group" style={{flex:1, minWidth:'120px'}}>
                <label htmlFor="iframeWidth">横幅</label>
                <input id="iframeWidth" type="text" value={iframeWidth}
                  onChange={e => setIframeWidth(e.target.value)} placeholder="100%" />
              </div>
              <div className="form-group" style={{flex:1, minWidth:'120px'}}>
                <label htmlFor="iframeHeight">高さ</label>
                <input id="iframeHeight" type="text" value={iframeHeight}
                  onChange={e => setIframeHeight(e.target.value)} placeholder="700px" />
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

      </div>
    </div>
  );
}
