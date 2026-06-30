import * as cheerio from 'cheerio';

const FETCH_TIMEOUT_MS = 8000;
const MAX_PAGE_TEXT_CHARS = 3000;
const MAX_TOTAL_PAGES = 20;
const MAX_HOPS = 8;
const LINKS_PER_HOP = 3;
const MAX_LINKS_FOR_SELECTION = 150;

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

function dedupeSameDomainLinks(links, domain, exclude) {
  const seen = new Set(exclude);
  const result = [];
  for (const link of links) {
    if (!sameDomain(link.url, domain)) continue; // never leave the target domain
    const normalized = link.url.split('#')[0];
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push({ ...link, url: normalized });
  }
  return result;
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

function pickByKeywords(links, question, limit) {
  const keywords = extractKeywords(question);
  return links
    .map(link => ({ ...link, score: scoreLink(link, keywords) }))
    .sort((a, b) => b.score - a.score)
    .filter(c => c.score > 0)
    .slice(0, limit);
}

// Link text on a real site rarely matches the user's exact wording (e.g. a
// citizen asks about "パスワード" but the city site calls it "暗証番号"), so
// plain substring matching misses most relevant pages. Ask Gemini to pick
// likely candidates semantically, with keyword matching only as a fallback
// if the model call fails or returns nothing.
async function pickRelevantLinks(genAI, links, question, limit) {
  if (links.length === 0) return [];
  const candidateLinks = links.slice(0, MAX_LINKS_FOR_SELECTION);

  if (genAI) {
    try {
      const list = candidateLinks
        .map((l, i) => `${i}. ${l.text || '(リンク文字なし)'} | ${l.url}`)
        .join('\n');
      const prompt = `以下は市役所サイトのページ内リンク一覧です。ユーザーの質問に答えるために開いて確認すべきページを、関連度が高い順に最大${limit}件選んでください。
ユーザーの言葉とサイト上の用語が違う場合（例:「パスワード」→「暗証番号」、「引っ越し」→「転入・転出届」）も考慮して、意味的に関連するものを選んでください。
該当する番号のみをJSON配列で出力してください（例: [3, 12, 0]）。関連するリンクが無ければ [] を返してください。説明文は不要です。

質問: ${question}

リンク一覧:
${list}`;

      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const match = text.match(/\[[\d,\s]*\]/);
      if (match) {
        const indices = JSON.parse(match[0]);
        const picked = indices
          .filter(i => Number.isInteger(i) && i >= 0 && i < candidateLinks.length)
          .slice(0, limit)
          .map(i => candidateLinks[i]);
        if (picked.length > 0) return picked;
      }
    } catch {
      // fall through to keyword matching
    }
  }

  return pickByKeywords(candidateLinks, question, limit);
}

export async function crawlSite(targetUrl, question, onStatus, genAI) {
  const domain = new URL(targetUrl).hostname;

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

  let frontierLinks = topPage.links;

  for (let hop = 0; hop < MAX_HOPS && pages.size < MAX_TOTAL_PAGES; hop++) {
    onStatus?.(hop === 0 ? '関連ページを探索中...' : `さらに詳しいページを確認中... (${hop + 1}/${MAX_HOPS})`);

    const candidateLinks = dedupeSameDomainLinks(frontierLinks, domain, Array.from(pages.keys()));
    if (candidateLinks.length === 0) break;

    const picks = await pickRelevantLinks(genAI, candidateLinks, question, LINKS_PER_HOP);
    if (picks.length === 0) break;

    const remainingBudget = MAX_TOTAL_PAGES - pages.size;
    const results = await Promise.all(picks.slice(0, remainingBudget).map(link => fetchPage(link.url)));

    const newLinks = [];
    for (const page of results) {
      if (page && pages.size < MAX_TOTAL_PAGES) {
        pages.set(page.url, { url: page.url, title: page.title, text: page.text });
        newLinks.push(...page.links);
      }
    }
    if (newLinks.length === 0) break;
    frontierLinks = newLinks;
  }

  return { pages: Array.from(pages.values()) };
}
