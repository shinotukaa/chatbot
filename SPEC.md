# 市役所AIチャットボット 仕様書

## 概要

市役所の公式WebサイトをリアルタイムでAIが調査し、市民の質問に回答するチャットボット。  
Next.js製のWebアプリとしてVercelにデプロイし、市役所サイトにiframeまたはフローティングウィジェットとして埋め込んで利用する。

---

## 技術スタック

| 項目 | 内容 |
|---|---|
| フレームワーク | Next.js 14 (App Router) |
| ホスティング | Vercel |
| AI | Google Gemini API (`gemini-2.5-flash`) |
| リンク選択AI | Google Gemini (`gemini-2.5-flash-lite`) |
| 検索方法 | Google Custom Search JSON API（設定時）/ リンククローラー（フォールバック） |
| HTML解析 | cheerio |
| ストリーミング | Server-Sent Events (SSE) |

---

## ディレクトリ構成

```
/
├── app/
│   ├── page.js              # チャット画面（メイン）
│   ├── layout.js            # 共通レイアウト
│   ├── globals.css          # スタイル
│   ├── admin/
│   │   └── page.js          # 管理画面
│   └── api/
│       ├── chat/route.js    # チャットAPI（SSEストリーミング）
│       ├── config/route.js  # 設定取得API
│       └── status/route.js  # APIキー確認API
├── lib/
│   ├── searcher.js          # Google Custom Search APIによる検索
│   └── crawler.js           # リンクBFS方式クローラー（フォールバック）
├── .env.example             # 環境変数サンプル
└── package.json
```

---

## 画面構成

### チャット画面（`/`）

- ヘッダー：サイト名・説明
- 検索対象URL表示
- チャット表示エリア（ユーザー発言 / AIアシスタント回答）
- ステータスバー（検索中・生成中など進捗表示）
- 参照元リスト（回答に使用したページのタイトルとURL）
- テキストエリア入力 + 送信ボタン
- Enter送信 / Shift+Enter改行

### 管理画面（`/admin`）

- 現在の設定値の確認（サーバーから取得）
- Vercel環境変数の設定手順
- 埋め込みコード生成（iframe / フローティングウィジェット）

---

## API仕様

### `POST /api/chat`

**リクエスト:**
```json
{
  "message": "質問文",
  "url": "https://www.city.example.lg.jp/"
}
```

**レスポンス:** SSEストリーム

| イベント | データ | 説明 |
|---|---|---|
| `status` | `{ message: "..." }` | 進捗メッセージ |
| `delta` | `{ text: "..." }` | 回答テキストの断片 |
| `done` | `{ sources: [...], pages: [...] }` | 完了・参照元情報 |
| `error` | `{ message: "..." }` | エラー |

**バリデーション:**
- メッセージ空チェック
- 4000文字上限
- プロンプトインジェクション検出（パターンマッチング）

**リトライ:** Gemini APIエラー時に最大5回（1s / 2s / 4s / 8s / 16s）

---

### `GET /api/config`

**レスポンス:**
```json
{
  "siteName": "市役所AIチャットボット",
  "siteUrl": "https://www.city.example.lg.jp/",
  "welcomeMessage": "ご質問をどうぞ。..."
}
```

---

### `GET /api/status`

**レスポンス:**
```json
{ "ok": true }
```

---

## 検索・クロール処理

### 優先：Google Custom Search JSON API（`lib/searcher.js`）

`GOOGLE_CSE_API_KEY` と `GOOGLE_CSE_CX` の両方が設定されている場合に使用。

1. Custom Search JSON APIに質問文を送信
2. `siteSearch={ドメイン}&siteSearchFilter=i` で対象ドメインのみに絞り込み
3. 最大8件の検索結果URLを並列フェッチ
4. 各ページのHTML本文をcheerioで抽出（最大3000文字/ページ）
5. フェッチ失敗ページはCSEのスニペットで補完

### フォールバック：リンクBFSクローラー（`lib/crawler.js`）

CSE環境変数が未設定の場合に使用。

1. トップページをフェッチしてリンクを収集（60秒キャッシュ）
2. Geminiが質問に関連するリンクを意味的に選択（flash-lite）
3. 選択したリンクページをフェッチ
4. 上記を最大2ホップ繰り返す（最大16ページ）

---

## AI回答生成

**モデル:** `gemini-2.5-flash`

**システムプロンプト（要約）:**
- 参考ページの内容のみを根拠に回答
- ページ外の情報は使用しない
- 該当情報がなければ「見つかりませんでした」と回答
- 日本語で丁寧に回答

---

## 環境変数

| 変数名 | 必須 | 説明 |
|---|---|---|
| `GEMINI_API_KEY` | 必須 | Google Gemini APIキー |
| `DEFAULT_URL` | 任意 | 検索対象サイトのURL（デフォルト：泉大津市） |
| `SITE_NAME` | 任意 | チャットボットのサイト名 |
| `WELCOME_MESSAGE` | 任意 | ウェルカムメッセージ |
| `GOOGLE_CSE_API_KEY` | 任意 | Google Custom Search JSON APIキー |
| `GOOGLE_CSE_CX` | 任意 | Programmable Search EngineのエンジンID |

---

## 埋め込み方式

### フローティングウィジェット（推奨）

- 右下に固定表示されるボタン
- クリックでチャットパネルが開閉
- 既存サイトのデザインを崩さない

### インライン埋め込み（iframe）

- ページ内にチャット画面をそのまま表示
- 横幅・高さを指定可能

---

## セキュリティ

- プロンプトインジェクション：正規表現パターンで検出・拒否
- 対象ドメイン制限：CSEは`siteSearchFilter=i`、クローラーは`sameDomain()`チェック
- XSS対策：ユーザー入力はHTMLエスケープ後にレンダリング
- APIキー：サーバーサイドのみで使用（クライアントに露出しない）

---

## 未解決課題

- Google Custom Search JSON API の 403 エラー（`This project does not have the access to Custom Search JSON API`）が継続中。APIキー・プロジェクト・課金設定は正常確認済み。原因調査中。
