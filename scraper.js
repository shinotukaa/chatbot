const { chromium } = require('playwright');
const cheerio = require('cheerio');

const MAX_SUBPAGES = 5;
const TIMEOUT = 15000;

async function fetchPage(browser, url) {
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    const html = await page.content();
    return html;
  } finally {
    await page.close();
  }
}

function extractContent(html, baseUrl) {
  const $ = cheerio.load(html);

  // Remove noise
  $('script, style, nav, footer, header, .breadcrumb, noscript').remove();

  const title = $('title').text().trim() || $('h1').first().text().trim();

  // Extract main text
  const text = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 8000);

  // Extract internal links
  const origin = new URL(baseUrl).origin;
  const links = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    const label = $(el).text().trim();
    if (!href || !label) return;
    try {
      const absolute = new URL(href, baseUrl).href;
      if (absolute.startsWith(origin) && !links.find(l => l.url === absolute)) {
        links.push({ url: absolute, label });
      }
    } catch (_) {}
  });

  return { title, text, links };
}

async function scrapeUrl(startUrl) {
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const pages = [];

  try {
    // Scrape main page
    const mainHtml = await fetchPage(browser, startUrl);
    const main = extractContent(mainHtml, startUrl);
    pages.push({ url: startUrl, ...main });

    // Scrape up to MAX_SUBPAGES relevant internal pages
    const subUrls = main.links
      .filter(l => l.url !== startUrl)
      .slice(0, MAX_SUBPAGES * 3); // fetch candidates

    let fetched = 0;
    for (const link of subUrls) {
      if (fetched >= MAX_SUBPAGES) break;
      try {
        const html = await fetchPage(browser, link.url);
        const content = extractContent(html, link.url);
        pages.push({ url: link.url, ...content });
        fetched++;
      } catch (e) {
        // skip failed pages
      }
    }
  } finally {
    await browser.close();
  }

  return pages;
}

module.exports = { scrapeUrl };
