require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { scrapeUrl } = require('./scraper');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const DEFAULT_URL = process.env.DEFAULT_URL || 'https://www.city.izumiotsu.lg.jp/index.html';

function extractUrl(message) {
  const match = message.match(/(?:元URL|URL)[：:\s]+(\S+)/i);
  if (match) return match[1].trim();
  const urlMatch = message.match(/https?:\/\/[^\s]+/);
  return urlMatch ? urlMatch[0] : null;
}

function buildContext(pages) {
  return pages.map(p =>
    `## ${p.title}\nURL: ${p.url}\n\n${p.text}`
  ).join('\n\n---\n\n');
}

app.post('/api/chat', async (req, res) => {
  const { message, url: clientUrl } = req.body;
  if (!message) return res.status(400).json({ error: 'message is required' });

  const targetUrl = clientUrl || extractUrl(message) || DEFAULT_URL;

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    send('status', { message: `${targetUrl} をクロール中...` });

    let pages;
    try {
      pages = await scrapeUrl(targetUrl);
    } catch (e) {
      send('error', { message: `URLの取得に失敗しました: ${e.message}` });
      res.end();
      return;
    }

    send('status', { message: `${pages.length}ページを取得しました。回答を生成中...` });

    const context = buildContext(pages);
    const pageUrls = pages.map(p => p.url);

    const systemPrompt = `あなたは市役所の案内AIアシスタントです。
以下のWebページの内容のみを参照して、ユーザーの質問に日本語で答えてください。
回答は丁寧かつ分かりやすくまとめてください。
回答の最後に必ず「## 参照ページ」というセクションを作り、実際に参照したページのURLをMarkdownリンク形式で列挙してください。
ページ外の情報は使用しないでください。情報が見つからない場合はその旨をお伝えください。`;

    const userPrompt = `以下のWebページの内容を参照して質問に答えてください。

# 取得したページ内容
${context}

# 質問
${message}`;

    const stream = await client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        send('delta', { text: chunk.delta.text });
      }
    }

    send('done', { pages: pageUrls });
  } catch (e) {
    send('error', { message: e.message });
  }

  res.end();
});

app.get('/api/default-url', (req, res) => {
  res.json({ url: DEFAULT_URL });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
