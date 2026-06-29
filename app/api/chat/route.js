import Anthropic from '@anthropic-ai/sdk';
import { scrapeUrl } from '@/lib/scraper';

export const runtime = 'nodejs';
export const maxDuration = 60;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const DEFAULT_URL = process.env.DEFAULT_URL || 'https://www.city.izumiotsu.lg.jp/index.html';

function extractUrl(message) {
  const match = message.match(/(?:元URL|URL)[：:\s]+(\S+)/i);
  if (match) return match[1].trim();
  const urlMatch = message.match(/https?:\/\/[^\s]+/);
  return urlMatch ? urlMatch[0] : null;
}

export async function POST(req) {
  const { message, url: clientUrl } = await req.json();
  if (!message) return new Response('message is required', { status: 400 });

  const targetUrl = clientUrl || extractUrl(message) || DEFAULT_URL;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event, data) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        send('status', { message: `${targetUrl} をクロール中...` });

        let pages;
        try {
          pages = await scrapeUrl(targetUrl);
        } catch (e) {
          send('error', { message: `URLの取得に失敗しました: ${e.message}` });
          controller.close();
          return;
        }

        send('status', { message: `${pages.length}ページを取得しました。回答を生成中...` });

        const context = pages.map(p => `## ${p.title}\nURL: ${p.url}\n\n${p.text}`).join('\n\n---\n\n');

        const aiStream = await client.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 2048,
          system: `あなたは市役所の案内AIアシスタントです。
以下のWebページの内容のみを参照して、ユーザーの質問に日本語で丁寧に答えてください。
回答の最後に必ず「## 参照ページ」というセクションを作り、参照したページのURLをMarkdownリンク形式で列挙してください。
ページ外の情報は使用しないでください。情報が見つからない場合はその旨をお伝えください。`,
          messages: [{
            role: 'user',
            content: `以下のWebページの内容を参照して質問に答えてください。\n\n# 取得したページ内容\n${context}\n\n# 質問\n${message}`,
          }],
        });

        for await (const chunk of aiStream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            send('delta', { text: chunk.delta.text });
          }
        }

        send('done', { pages: pages.map(p => p.url) });
      } catch (e) {
        send('error', { message: e.message });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
