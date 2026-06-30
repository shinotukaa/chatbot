import * as cheerio from 'cheerio';

const FETCH_TIMEOUT_MS = 8000;
const MAX_PAGE_TEXT_CHARS = 3000;
const TOP_LINK_PICKS = 6;
const SECOND_HOP_PICKS = 3;
const MAX_TOTAL_PAGES = 8;

// Simple in-memory cache, scoped to a warm serverless instance. Not durable,
// just avoids refetching the same top-page link graph for back-to-back questions.
const topPageCache = new Map();
const CACHE_TTL_MS = 60_000;

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

    const links = [];
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      const linkText = $(el).text().replace(/\s+/g, ' ').trim();
      if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) return;
      try {
        const abs = new URL(href, url).href;
        links.push({ url: abs, text: linkText });
      } catch {
        // ignore malformed hrefs
      }
    });

    return { url, title, text, links };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function sameDomain(url, domain) {
  try {
    return new URL(url).hostname === domain;
  } catch {
    return false;
  }
}

function extractKeywords(question) {
  // Japanese has no spaces, so split on punctuation and a handful of common
  // particles/verb endings to approximate word boundaries without a full
  // tokenizer. Keep the whole question too, for exact-phrase matches.
  const normalized = question.replace(/[、。！？!?「」『』,.\s]+/g, ' ');
  const particleSplit = normalized
    .split(/の|とか|ある？?|ですか|ますか|について|に関する|を教えて|教えて/g)
    .join(' ');
  const words = particleSplit
    .split(' ')
    .map(w => w.trim())
    .filter(w => w.length >= 2);
  return Array.from(new Set([question.trim(), ...words]));
}

function scoreLink(link, keywords) {
  const haystack = `${link.text} ${link.url}`;
  let score = 0;
  for (const kw of keywords) {
    if (haystack.includes(kw)) score += 1;
  }
  return score;
}

function pickTopLinks(links, keywords, domain, exclude, limit) {
  const seen = new Set(exclude);
  const candidates = [];
  for (const link of links) {
    if (!sameDomain(link.url, domain)) continue; // never leave the target domain
    const normalized = link.url.split('#')[0];
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    candidates.push({ ...link, url: normalized, score: scoreLink(link, keywords) });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates.filter(c => c.score > 0).slice(0, limit);
}

export async function crawlSite(targetUrl, question, onStatus) {
  const domain = new URL(targetUrl).hostname;
  const keywords = extractKeywords(question);

  onStatus?.('市役所サイトのトップページを確認中...');

  let topPage = topPageCache.get(domain);
  if (topPage && Date.now() - topPage.fetchedAt > CACHE_TTL_MS) topPage = null;
  if (!topPage) {
    const fetched = await fetchPage(targetUrl);
    if (!fetched) return { pages: [] };
    topPage = { ...fetched, fetchedAt: Date.now() };
    topPageCache.set(domain, topPage);
  }

  const pages = new Map();
  pages.set(topPage.url, { url: topPage.url, title: topPage.title, text: topPage.text });

  onStatus?.('関連ページを探索中...');
  const firstHopPicks = pickTopLinks(topPage.links, keywords, domain, [topPage.url], TOP_LINK_PICKS);

  const firstHopResults = await Promise.all(firstHopPicks.map(link => fetchPage(link.url)));
  for (const page of firstHopResults) {
    if (page && pages.size < MAX_TOTAL_PAGES) {
      pages.set(page.url, { url: page.url, title: page.title, text: page.text });
    }
  }

  if (pages.size < MAX_TOTAL_PAGES) {
    onStatus?.('さらに詳しいページを確認中...');
    const secondHopLinks = firstHopResults
      .filter(Boolean)
      .flatMap(page => page.links);
    const excludeUrls = Array.from(pages.keys());
    const secondHopPicks = pickTopLinks(secondHopLinks, keywords, domain, excludeUrls, SECOND_HOP_PICKS);
    const secondHopResults = await Promise.all(secondHopPicks.map(link => fetchPage(link.url)));
    for (const page of secondHopResults) {
      if (page && pages.size < MAX_TOTAL_PAGES) {
        pages.set(page.url, { url: page.url, title: page.title, text: page.text });
      }
    }
  }

  return { pages: Array.from(pages.values()) };
}
