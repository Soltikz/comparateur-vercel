import { chromium as pw } from 'playwright-core';
import chromium from '@sparticuz/chromium';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

// Liens produits reconnus sur les pages de résultats
const PRODUCT_LINK = [
  /stylevana\.com\/[a-z]{2}_[A-Z]{2}\/[^/?#]+\.html$/,
  /yesstyle\.com\/.*\/info\.html\/pid\.\d+/,
  /\/products\/[^/?#]+/,          // Shopify (yoonah, koreanskincare…)
  /\/produit\/[^/?#]+/,           // WooCommerce
];
const NOT_PRODUCT = /catalogsearch|\/list\.html|\/search|\/collections\/?$|\/marques\/|\/brands?\//;

export const parsePrice = (txt) => {
  if (txt == null) return null;
  const m = String(txt).replace(/\s/g, '').match(/(\d{1,3}(?:[., ]\d{3})*(?:[.,]\d{1,2})|\d+(?:[.,]\d{1,2})?)/);
  if (!m) return null;
  let s = m[1];
  if (/,\d{1,2}$/.test(s)) s = s.replace(/[. ]/g, '').replace(',', '.');
  else s = s.replace(/[, ]/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
};

const tokens = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .split(/[^a-z0-9]+/).filter((t) => t.length > 1);

export function bestMatch(links, query) {
  const q = new Set(tokens(query));
  let best = null;
  for (const { href, text } of links) {
    if (NOT_PRODUCT.test(href) || !PRODUCT_LINK.some((r) => r.test(href.split('?')[0]))) continue;
    const t = new Set([...tokens(text), ...tokens(decodeURIComponent(href))]);
    let score = 0;
    q.forEach((w) => { if (t.has(w)) score++; });
    if (/set|bundle|kit|\d+ea|x\s?\d/i.test(text) && !/set|bundle|kit|coffret/i.test(query)) score -= 2;
    if (!best || score > best.score) best = { href, score };
  }
  return best && best.score >= Math.max(2, Math.ceil(q.size * 0.5)) ? best.href : null;
}

// Les liens Google « site:xxx » sont convertis en recherche sur le site lui-même
function toSiteSearch(url) {
  const u = new URL(url);
  if (!/google\./.test(u.hostname)) return [url];
  const q = u.searchParams.get('q') || '';
  const site = q.match(/site:(\S+)/)?.[1];
  const terms = encodeURIComponent(q.replace(/site:\S+/, '').trim());
  if (!site) return [];
  return [`https://${site}/search?q=${terms}&type=product`, `https://${site}/?s=${terms}&post_type=product`];
}

const isSearchUrl = (url) => /[?&](q|s)=|catalogsearch|list\.html|google\./.test(url);

async function extractPrice(page, url) {
  // 1) Shopify : /products/xxx.js donne price et compare_at_price (en centimes)
  if (/\/products\//.test(url)) {
    try {
      const r = await page.request.get(url.split('?')[0].replace(/\/$/, '') + '.js');
      if (r.ok()) {
        const p = await r.json();
        const avail = p.variants?.find((x) => x.available);
        const v = avail || p.variants?.[0] || p;
        const price = (v.price ?? p.price) / 100;
        const compare = (v.compare_at_price ?? p.compare_at_price) / 100;
        const inStock = avail ? true : (p.available ?? false);
        return { price: compare > price ? compare : price, currency: 'EUR', promo: compare > price, stock: inStock ? 'en stock' : 'rupture' };
      }
    } catch { /* on passe au cas générique */ }
  }

  // 2) Cas générique : JSON-LD + prix barré dans le DOM
  return page.evaluate(() => {
    const out = { price: null, list: null, currency: null, avail: null, oosText: false };
    const walk = (o) => {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o)) return o.forEach(walk);
      const t = [].concat(o['@type'] || []);
      if (t.includes('Offer') || t.includes('AggregateOffer')) {
        out.price ??= o.price ?? o.lowPrice;
        out.currency ??= o.priceCurrency;
        if (o.availability) out.avail ??= String(o.availability);
        const spec = [].concat(o.priceSpecification || []);
        const lp = spec.find((s) => /ListPrice|StrikethroughPrice/i.test(s.priceType || ''));
        if (lp) out.list ??= lp.price;
      }
      Object.values(o).forEach(walk);
    };
    document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
      try { walk(JSON.parse(s.textContent)); } catch {}
    });
    out.price ??= document.querySelector('[itemprop="price"]')?.getAttribute('content')
      ?? document.querySelector('meta[property="product:price:amount"]')?.content;
    out.currency ??= document.querySelector('[itemprop="priceCurrency"]')?.getAttribute('content')
      ?? document.querySelector('meta[property="product:price:currency"]')?.content;

    const sel = '.old-price .price, del, s, [class*="compare" i], [class*="was-price" i], [class*="old-price" i], [class*="original" i], [class*="strike" i], [class*="regular-price" i]';
    const main = document.querySelector('main, #maincontent, .product-info-main, [class*="product-detail" i]') || document.body;
    const el = [...main.querySelectorAll(sel)].find((e) => /\d/.test(e.textContent) && e.offsetParent !== null);
    if (el) out.list ??= el.textContent;
    const zone = (document.querySelector('.product-info-main, [class*="product-info" i], [class*="product__info" i], [class*="product-detail" i], form[action*="/cart/add"]') || main).innerText.slice(0, 3000);
    out.oosText = /rupture de stock|en rupture|épuisé|indisponible|out of stock|sold out|no longer available|temporarily unavailable/i.test(zone);
    if (!out.currency) {
      const txt = main.innerText.slice(0, 4000);
      out.currency = /€/.test(txt) ? 'EUR' : /US\$|\$\s?US|USD/.test(txt) ? 'USD' : null;
    }
    return out;
  }).then((o) => {
    const price = parsePriceSafe(o.price);
    const list = parsePriceSafe(o.list);
    const promo = list != null && price != null && list > price && list < price * 3;
    let stock = null;
    if (o.avail) stock = /InStock|LimitedAvailability|OnlineOnly|InStoreOnly/i.test(o.avail) ? 'en stock' : /OutOfStock|SoldOut|Discontinued/i.test(o.avail) ? 'rupture' : null;
    if (o.oosText && stock !== 'en stock') stock = 'rupture';
    stock ??= 'en stock';
    return { price: promo ? list : price, currency: o.currency, promo, stock };
  });
}
const parsePriceSafe = (v) => (typeof v === 'number' ? v : parsePrice(v));

let rateCache = null;
async function usdRate() {
  if (rateCache && Date.now() - rateCache.at < 6 * 3600e3) return rateCache.value;
  let value = 0.92;
  try {
    const r = await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR');
    value = (await r.json()).rates.EUR;
  } catch { /* taux par défaut */ }
  rateCache = { value, at: Date.now() };
  return value;
}

// Navigateur partagé entre les appels d'une même instance (Fluid compute)
let contextPromise = null;
async function getContext() {
  if (!contextPromise) {
    contextPromise = (async () => {
      const browser = await pw.launch(process.env.CHROME_PATH
        ? { headless: true, executablePath: process.env.CHROME_PATH }
        : { headless: true, args: chromium.args, executablePath: await chromium.executablePath() });
      browser.on('disconnected', () => { contextPromise = null; });
      const context = await browser.newContext({ userAgent: UA, locale: 'fr-FR', viewport: { width: 1366, height: 900 } });
      await context.addCookies([{ name: 'currency', value: 'EUR', domain: '.yesstyle.com', path: '/' }]);
      // Images, polices et médias inutiles : on les bloque pour aller plus vite
      await context.route('**/*', (route) => (['image', 'font', 'media'].includes(route.request().resourceType()) ? route.abort() : route.continue()));
      return context;
    })().catch((e) => { contextPromise = null; throw e; });
  }
  return contextPromise;
}

export async function lookup(url, query) {
  const context = await getContext();
  const rate = await usdRate();
  const page = await context.newPage();
  try {
    let productUrl = isSearchUrl(url) ? null : url;
    for (const searchUrl of productUrl ? [] : toSiteSearch(url)) {
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForSelector('a[href*="/products/"], a[href*="info.html"], a.product-item-link, a[href*="/produit/"]', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(1000);
      const links = await page.$$eval('a[href]', (as) => as.map((a) => ({ href: a.href, text: a.textContent.trim() || a.title || a.querySelector('img')?.alt || '' })));
      productUrl = bestMatch(links, query);
      if (productUrl) break;
    }
    if (!productUrl) return { status: 'introuvable' };

    await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(1500);
    const r = await extractPrice(page, productUrl);
    if (r.price == null) return { status: 'prix non lu', stock: r.stock, url: productUrl };
    const eur = r.currency && /USD/i.test(r.currency) ? +(r.price * rate).toFixed(2) : +r.price.toFixed(2);
    return { status: 'ok', promo: r.promo, stock: r.stock, url: productUrl, price: eur };
  } catch (e) {
    return { status: 'erreur', error: e.message.split('\n')[0] };
  } finally {
    await page.close().catch(() => {});
  }
}
