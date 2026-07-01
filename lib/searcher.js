import * as cheerio from 'cheerio';

const FETCH_TIMEOUT_MS = 6000;
const MAX_PAGE_TEXT_CHARS = 3000;
const SERP_ENDPOINT = 'https://serpapi.com/search.json';
const NUM_RESULTS = 8;

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

export async function searchSite(targetUrl, question, onStatus) {
  const domain = new URL(targetUrl).hostname;
  const apiKey = process.env.SERP_API_KEY;

  if (!apiKey) {
    throw new Error('SERP_API_KEY の環境変数が設定されていません。');
  }

  onStatus?.('Google検索でページを探しています...');

  const searchUrl = new URL(SERP_ENDPOINT);
  searchUrl.searchParams.set('engine', 'google');
  searchUrl.searchParams.set('q', `site:${domain} ${question}`);
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
  const items = data.organic_results || [];

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
