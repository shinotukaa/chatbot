import * as cheerio from 'cheerio';

const FETCH_TIMEOUT_MS = 6000;
const MAX_PAGE_TEXT_CHARS = 3000;
const CSE_ENDPOINT = 'https://www.googleapis.com/customsearch/v1';
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
  const apiKey = process.env.GOOGLE_CSE_API_KEY;
  const cx = process.env.GOOGLE_CSE_CX;

  if (!apiKey || !cx) {
    throw new Error('GOOGLE_CSE_API_KEY と GOOGLE_CSE_CX の環境変数が設定されていません。');
  }

  onStatus?.('Google検索でページを探しています...');

  const searchUrl = new URL(CSE_ENDPOINT);
  searchUrl.searchParams.set('key', apiKey);
  searchUrl.searchParams.set('cx', cx);
  searchUrl.searchParams.set('q', question);
  searchUrl.searchParams.set('siteSearch', domain);
  searchUrl.searchParams.set('siteSearchFilter', 'i');
  searchUrl.searchParams.set('num', String(NUM_RESULTS));

  let searchRes;
  try {
    searchRes = await fetch(searchUrl.href);
  } catch (e) {
    throw new Error(`Google Custom Search APIへの接続に失敗しました: ${e.message}`);
  }

  if (!searchRes.ok) {
    const errBody = await searchRes.text().catch(() => '');
    throw new Error(`Google Custom Search APIエラー (${searchRes.status}): ${errBody.slice(0, 200)}`);
  }

  const data = await searchRes.json();
  const items = data.items || [];

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

  // If we couldn't fetch some pages, use the snippet from CSE as fallback
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
