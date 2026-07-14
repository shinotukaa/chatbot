import * as cheerio from 'cheerio';

const FETCH_TIMEOUT_MS = 6000;
const MAX_PAGE_TEXT_CHARS = 3000;
const SERP_ENDPOINT = 'https://serpapi.com/search.json';
const NUM_RESULTS = 5;

async function fetchPage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CityHallChatbot/1.0)' },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return null;

    const html = await res.text();
    const $ = cheerio.load(html);
    $('script, style, noscript').remove();

    const title = $('title').first().text().trim();
    const text = $('body').text().replace(/\s+/g, ' ').trim().slice(0, MAX_PAGE_TEXT_CHARS);

    return { url, title, text };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function sameDomain(url, domain) {
  try {
    const host = new URL(url).hostname;
    return host === domain || host.endsWith(`.${domain}`);
  } catch {
    return false;
  }
}

async function buildSearchQuery(question, genAI) {
  if (!genAI) return question;
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
      generationConfig: { maxOutputTokens: 40, temperature: 0 },
    });
    const result = await model.generateContent(
      `以下の質問を、Google検索に適した簡潔な日本語キーワード（3〜5語）に変換してください。キーワードのみを出力し、説明文は不要です。\n質問: ${question}`
    );
    const kw = result.response.text().trim().replace(/\n/g, ' ');
    return kw || question;
  } catch {
    return question;
  }
}

export async function searchSite(targetUrl, question, onStatus, genAI) {
  const domain = new URL(targetUrl).hostname;
  const apiKey = process.env.SERP_API_KEY;

  if (!apiKey) {
    throw new Error('SERP_API_KEY の環境変数が設定されていません。');
  }

  onStatus?.('検索中...');

  const searchQuery = await buildSearchQuery(question, genAI);

  const searchUrl = new URL(SERP_ENDPOINT);
  searchUrl.searchParams.set('engine', 'google');
  searchUrl.searchParams.set('q', `site:${domain} ${searchQuery}`);
  searchUrl.searchParams.set('api_key', apiKey);
  searchUrl.searchParams.set('num', String(NUM_RESULTS));
  searchUrl.searchParams.set('hl', 'ja');

  let searchRes;
  try {
    searchRes = await fetch(searchUrl.href);
  } catch (e) {
    throw new Error(`SerpAPIへの接続に失敗しました: ${e.message}`);
  }

  if (!searchRes.ok) {
    const errBody = await searchRes.json().catch(() => ({}));
    throw new Error(`SerpAPIエラー (${searchRes.status}): ${errBody.error || '不明なエラー'}`);
  }

  const data = await searchRes.json();
  // "site:"での絞り込みでもGoogleが十分な結果が無いと判断すると、
  // 制限を無視して一般的な検索結果を返すことがあるため、ここで対象ドメイン以外を除外する
  const items = (data.organic_results || []).filter(item => item.link && sameDomain(item.link, domain));

  if (items.length === 0) {
    return { pages: [] };
  }

  onStatus?.('見つかったページの内容を確認中...');

  const results = await Promise.all(
    items.map(item => fetchPage(item.link))
  );

  const pages = results
    .filter(p => p !== null)
    .map(p => ({ url: p.url, title: p.title, text: p.text }));

  // フェッチ失敗ページはSerpAPIのスニペットで補完
  const fetchedUrls = new Set(pages.map(p => p.url));
  for (const item of items) {
    if (!fetchedUrls.has(item.link) && item.snippet) {
      pages.push({
        url: item.link,
        title: item.title || item.link,
        text: item.snippet,
      });
    }
  }

  return { pages };
}
