'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const DEFAULTS = {
  siteName: '市役所AIチャットボット',
  siteUrl: 'https://www.city.izumiotsu.lg.jp/index.html',
  welcomeMessage: 'ご質問をどうぞ。市のWebサイトをGoogle検索でリアルタイムに調べて、丁寧にお答えします。',
};

export default function AdminPage() {
  const [form, setForm] = useState(DEFAULTS);
  const [saved, setSaved] = useState(false);
  const [apiKeyOk, setApiKeyOk] = useState(null);

  useEffect(() => {
    // Load saved config
    const saved = localStorage.getItem('chatbot_config');
    if (saved) {
      try { setForm(f => ({ ...DEFAULTS, ...JSON.parse(saved) })); } catch (_) {}
    }
    // Check API key status
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
              <input
                id="siteName"
                type="text"
                value={form.siteName}
                onChange={handleChange('siteName')}
                placeholder="例：〇〇市役所 AIチャットボット"
              />
            </div>

            <div className="form-group">
              <label htmlFor="siteUrl">対象サイトURL</label>
              <p className="hint">AIが参照する公式サイトのURLを入力してください。</p>
              <input
                id="siteUrl"
                type="url"
                value={form.siteUrl}
                onChange={handleChange('siteUrl')}
                placeholder="https://www.city.example.lg.jp/"
              />
            </div>

            <div className="form-group">
              <label htmlFor="welcomeMessage">ウェルカムメッセージ</label>
              <p className="hint">チャット画面を開いたときに表示される案内文です。</p>
              <textarea
                id="welcomeMessage"
                rows={4}
                value={form.welcomeMessage}
                onChange={handleChange('welcomeMessage')}
                placeholder="例：ご質問をどうぞ。"
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="submit" className="save-btn">設定を保存</button>
              <button type="button" onClick={handleReset}
                style={{ background: 'none', border: '1px solid #d0d8e4', borderRadius: '8px', padding: '11px 20px', cursor: 'pointer', fontSize: '0.9rem', color: '#5a6a7e' }}>
                初期値に戻す
              </button>
              {saved && (
                <div className="toast">✓ 保存しました</div>
              )}
            </div>
          </form>
        </div>

        {/* Preview note */}
        <div className="admin-card">
          <h2>設定のプレビュー</h2>
          <div style={{ background: '#f5f7fa', border: '1px solid #d0d8e4', borderRadius: '8px', padding: '14px 18px', fontSize: '0.88rem', lineHeight: '1.7', color: '#1a1a2e' }}>
            <div><strong>サイト名：</strong>{form.siteName}</div>
            <div><strong>対象URL：</strong>{form.siteUrl || '（APIデフォルト値を使用）'}</div>
            <div><strong>ウェルカムメッセージ：</strong>{form.welcomeMessage}</div>
          </div>
          <div style={{ marginTop: '14px' }}>
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
