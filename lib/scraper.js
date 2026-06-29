import * as cheerio from 'cheerio';

const MAX_SUBPAGES = 5;
const FETCH_TIMEOUT = 10000;

async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CityBot/1.0)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    // Detect encoding from Content-Type or meta charset
    const contentType = res.headers.get('content-type') || '';
    let encoding = 'utf-8';
    if (contentType.includes('charset=')) {
      encoding = contentType.split('charset=')[1].trim();
    }
    try {
      return new TextDecoder(encoding).decode(buf);
    } catch {
      return new TextDecoder('utf-8').decode(buf);
    }
  } finally {
    clearTimeout(timer);
  }
}

function extractContent(html, baseUrl) {
  const $ = cheerio.load(html);
  $('script, style, nav, footer, noscript, iframe').remove();

  const title = $('title').text().trim() || $('h1').first().text().trim() || baseUrl;
  const text = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 6000);

  const origin = new URL(baseUrl).origin;
  const links = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    const label = $(el).text().trim();
    if (!href || !label || href.startsWith('#') || href.startsWith('mailto:')) return;
    try {
      const absolute = new URL(href, baseUrl).href;
      if (absolute.startsWith(origin) && !links.find(l => l.url === absolute)) {
        links.push({ url: absolute, label });
      }
    } catch (_) {}
  });

  return { title, text, links };
}

export async function scrapeUrl(startUrl) {
  const pages = [];

  const mainHtml = await fetchHtml(startUrl);
  const main = extractContent(mainHtml, startUrl);
  pages.push({ url: startUrl, title: main.title, text: main.text });

  const subLinks = main.links.filter(l => l.url !== startUrl).slice(0, MAX_SUBPAGES * 2);
  let fetched = 0;

  for (const link of subLinks) {
    if (fetched >= MAX_SUBPAGES) break;
    try {
      const html = await fetchHtml(link.url);
      const content = extractContent(html, link.url);
      pages.push({ url: link.url, title: content.title, text: content.text });
      fetched++;
    } catch (_) {}
  }

  return pages;
}
