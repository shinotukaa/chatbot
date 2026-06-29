import { GoogleGenerativeAI } from '@google/generative-ai';

export const runtime = 'nodejs';
export const maxDuration = 60;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
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
  const targetDomain = new URL(targetUrl).hostname;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event, data) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        send('status', { message: 'Google検索で情報を取得中...' });

        const model = genAI.getGenerativeModel({
          model: 'gemini-2.0-flash',
          tools: [{ googleSearch: {} }],
          systemInstruction: `あなたは市役所の案内AIアシスタントです。
ユーザーの質問に対して、主に「${targetDomain}」のサイト（${targetUrl}）を参照して、日本語で丁寧に答えてください。
Google検索を使って最新の情報を取得してください。
回答の最後に「## 参照ページ」セクションを設け、参照したページのURLをMarkdownリンク形式で列挙してください。`,
        });

        const prompt = `以下のサイトの情報を中心に質問に答えてください。
対象サイト: ${targetUrl}
質問: ${message}`;

        const result = await model.generateContentStream(prompt);

        let fullText = '';
        for await (const chunk of result.stream) {
          const text = chunk.text();
          if (text) {
            fullText += text;
            send('delta', { text });
          }
        }

        // Extract grounding citations
        const response = await result.response;
        const groundingMeta = response.candidates?.[0]?.groundingMetadata;
        const chunks = groundingMeta?.groundingChunks ?? [];
        const citedUrls = [...new Set(
          chunks.map(c => c.web?.uri).filter(Boolean)
        )];

        // If Gemini didn't cite any URL, append target URL
        const pages = citedUrls.length > 0 ? citedUrls : [targetUrl];
        send('done', { pages });
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
