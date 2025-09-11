'use strict';
const cheerio = require('cheerio');

// Serverless handler – čistý scraper bez mocků, zdroje: PriceCharting a CardMarket
module.exports.config = { runtime: 'nodejs22.x' };

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

    const { pokemon, debug, url } = req.query || {};
    if (!pokemon && !url) return res.status(400).json({ success: false, error: 'pokemon or url is required' });

    const dbg = { searchTried: [], pcLinks: 0, pcDetails: 0, cmTried: false };
    try {
        if (url) {
            const item = await parseSinglePriceChartingUrl(url, pokemon || 'query');
            const payload = { success: true, source: 'PriceCharting', pokemon: pokemon || 'byUrl', cards: item ? [item] : [], count: item ? 1 : 0 };
            if (debug === '1') payload.debug = { byUrl: url };
            return res.status(200).json(payload);
        }
        const pc = await scrapePriceCharting(pokemon, dbg);
        if (pc.length) return res.status(200).json({ success: true, source: 'PriceCharting', pokemon, cards: pc, count: pc.length });
        const cm = await scrapeCardMarket(pokemon, dbg);
        const payload = { success: true, source: 'CardMarket', pokemon, cards: cm, count: cm.length };
        if (debug === '1') payload.debug = dbg;
        return res.status(200).json(payload);
    } catch (e) {
        console.error('Handler error:', e);
        const payload = { success: true, source: 'none', pokemon, cards: [], count: 0 };
        if (debug === '1') payload.debug = dbg;
        return res.status(200).json(payload);
    }
}

async function fetchHtml(url, headers) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 12000);
    try {
        const r = await fetch(url, { headers, signal: controller.signal });
        if (!r.ok) return '';
        const txt = await r.text();
        return txt && txt.length > 800 ? txt : '';
    } catch { return ''; } finally { clearTimeout(t); }
}

// ===== PriceCharting =====
async function scrapePriceCharting(q, dbg = {}) {
    const base = 'https://www.pricecharting.com';
    const searchBase = `${base}/search-products?q=${encodeURIComponent(q + ' pokemon card')}`;
    const searchAlt = `${base}/search-products?q=${encodeURIComponent(q)}`;

    // 1) Posbírej odkazy na detail karet z několika stránek výsledků
    const detailLinks = new Set();
    for (let page = 1; page <= 3; page++) {
        const url = page === 1 ? searchBase : `${searchBase}&page=${page}`;
        dbg.searchTried && dbg.searchTried.push(url);
        const html = await fetchHtml(url, {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Connection': 'keep-alive',
            'Referer': 'https://www.pricecharting.com/'
        });
        if (!html) break;

        const links = findPcGameLinks(html);
        links.forEach(href => detailLinks.add(href.startsWith('http') ? href : base + href));
        if (detailLinks.size >= 80) break;
    }

    // Pokud nic, zkus alternativní dotaz bez "pokemon card"
    if (detailLinks.size === 0) {
        for (let page = 1; page <= 2; page++) {
            const url = page === 1 ? searchAlt : `${searchAlt}&page=${page}`;
            dbg.searchTried && dbg.searchTried.push(url);
            const html = await fetchHtml(url, {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Connection': 'keep-alive',
                'Referer': 'https://www.pricecharting.com/'
            });
            if (!html) break;
            const links = findPcGameLinks(html);
            links.forEach(href => detailLinks.add(href.startsWith('http') ? href : base + href));
            if (detailLinks.size >= 80) break;
        }
    }

    // 2) Stáhni detaily a vyparsuj přesné ceny (omezený paralelismus)
    const results = [];
    const urls = Array.from(detailLinks).slice(0, 80);
    dbg.pcLinks = urls.length;
    const concurrency = 6;
    for (let i = 0; i < urls.length; i += concurrency) {
        const chunk = urls.slice(i, i + concurrency);
        const items = await Promise.all(chunk.map(async (detailUrl, idx) => {
            const html = await fetchHtml(detailUrl, {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Connection': 'keep-alive',
                'Referer': 'https://www.pricecharting.com/'
            });
            if (!html) return null;
            const itm = parsePcDetail(html, detailUrl, q, i + idx);
            return itm;
        }));
        items.forEach(it => { if (it) results.push(it); });
        if (results.length >= 60) break;
    }
    dbg.pcDetails = results.length;

    return results;
}

function findPcGameLinks(html) {
    const out = new Set();
    try {
        const $ = cheerio.load(html);
        $('a[href]').each((_, el) => {
            const href = $(el).attr('href');
            if (!href) return;
            if (href.startsWith('/game/') || href.startsWith('/prices/')) out.add(href);
        });
    } catch {}
    return Array.from(out);
}

function parsePcDetail(html, url, q, index) {
    const $ = cheerio.load(html);
    const title = ($('h1').first().text() || '').trim() || pick(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) || cap(q);
    const name = title.replace(/\s*\|[\s\S]*/,'').replace(/\s+#\d+.*/,'').trim();
    const number = (title.match(/#\s?(\d+)/) || [,'?'])[1];
    const setName = pick(html, />\s*Pokemon\s+Base\s+Set\s*</i) ? 'Pokemon Base Set' : (pick(html, /Trading Cards[^<]*>\s*Pokemon Cards\s*>\s*([^<]+)/i) || 'PriceCharting');

    // Obrazek – vezmi první větší z části "More Photos" nebo "Main Image"
    let imageUrl = $('meta[property="og:image"]').attr('content')
                  || pick(html, /<img[^>]*alt="[^"]*Main Image[^"]*"[^>]*src="([^"]+\.(?:jpg|jpeg|png|webp))"/i)
                  || pick(html, /<img[^>]*src="([^"]+\/(?:large|main|hires)[^"<>]*\.(?:jpg|jpeg|png|webp))"/i)
                  || pick(html, /<img[^>]*src="([^"]+\.(?:jpg|jpeg|png|webp))"[^>]*class="[^"]*(?:main|photo)[^"]*"/i);
    if (imageUrl && !/^https?:/i.test(imageUrl)) imageUrl = `https://www.pricecharting.com${imageUrl}`;

    // Ceny – parsuj sekci "Full Price Guide"
    const grades = [
        'Ungraded','Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6','Grade 7','Grade 8','Grade 9','Grade 9.5',
        'SGC 10','CGC 10','PSA 10','BGS 10','BGS 10 Black','CGC 10 Pristine'
    ];
    const prices = [];
    for (const label of grades) {
        const val = findDollarNear(html, label);
        if (val !== null) {
            const grade = mapLabelToPsa(label);
            if (grade) prices.push({ grade, price: Math.round(val*100), source: 'PriceCharting', type: grade==='PSA0'?'Neohodnoceno':`PSA ${grade.slice(3)}` });
        }
    }
    // dedupe keep highest per grade
    const best = new Map();
    for (const p of prices) { const prev = best.get(p.grade); if (!prev || p.price > prev.price) best.set(p.grade, p); }

    return { id: `pc_${q}_${index}`, name, setName, number, imageUrl, prices: Array.from(best.values()).sort((a,b)=>parseInt(b.grade.slice(3))-parseInt(a.grade.slice(3))), priceHistory: [], source: 'PriceCharting', url };
}

async function parseSinglePriceChartingUrl(detailUrl, q) {
    const html = await fetchHtml(detailUrl, {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive',
        'Referer': 'https://www.pricecharting.com/'
    });
    if (!html) return null;
    return parsePcDetail(html, detailUrl, q, 0);
}

function findDollarNear(html, label) {
    // hledej buď v tabulce (label v <td>) nebo obecně do 150 znaků
    const patterns = [
        new RegExp(label.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&') + '[^$]{0,160}\\$\\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\\.[0-9]{1,2})?)','i'),
        new RegExp('<td[^>]*>\\s*' + label.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&') + '\\s*<\\/td>\\s*<td[^>]*>\\s*\\$\\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\\.[0-9]{1,2})?)','i')
    ];
    for (const re of patterns) {
        const m = html.match(re);
        if (m) {
            const v = parseFloat(m[1].replace(/,/g,''));
            if (v>0 && v<1000000) return v;
        }
    }
    return null;
}

function mapLabelToPsa(label) {
    const l = label.toLowerCase();
    if (l.includes('ungraded')) return 'PSA0';
    const g = l.match(/grade\s*(\d+(?:\.5)?)/);
    if (g) {
        const val = g[1];
        if (val === '9.5') return 'PSA9';
        const n = parseInt(val,10); if (n>=1 && n<=10) return `PSA${n}`;
    }
    if (l.includes('psa 10')) return 'PSA10';
    if (l.includes('bgs 10')) return 'PSA10';
    if (l.includes('sgc 10')) return 'PSA10';
    if (l.includes('cgc 10')) return 'PSA10';
    if (l.includes('pristine')) return 'PSA10';
    return null;
}

function collectPcGrades(html) {
    const out = [];
    const pushNear = (label, grade) => {
        const i = html.toLowerCase().indexOf(label.toLowerCase());
        if (i === -1) return;
        const win = html.slice(Math.max(0, i - 150), Math.min(html.length, i + 280));
        const m = win.match(/\$\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/);
        if (!m) return;
        const usd = parseFloat(m[1].replace(/,/g, ''));
        if (usd > 0 && usd < 100000) out.push({ grade, price: Math.round(usd * 100), source: 'PriceCharting', type: grade==='PSA0'?'Neohodnoceno':`PSA ${grade.slice(3)}` });
    };
    // Ungraded
    ['Ungraded','Unrated','Raw'].forEach(k=>pushNear(k,'PSA0'));
    // PSA / Grade 10..1
    for (let g=10; g>=1; g--) { pushNear(`PSA ${g}`, `PSA${g}`); pushNear(`Grade ${g}`, `PSA${g}`); }
    // SGC/CGC/BGS 10 mapujeme na PSA10
    ['BGS 10 Black Label','BGS 10 Black','SGC 10','CGC 10 Pristine','Pristine 10'].forEach(k=>pushNear(k,'PSA10'));

    // dedupe by grade (ponecháme nejvyšší)
    const best = new Map();
    for (const p of out) { const prev = best.get(p.grade); if (!prev || p.price > prev.price) best.set(p.grade, p); }
    return [...best.values()].sort((a,b)=>parseInt(b.grade.slice(3))-parseInt(a.grade.slice(3)));
}

// ===== CardMarket =====
async function scrapeCardMarket(q, dbg = {}) {
    const url = `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${encodeURIComponent(q)}`;
    dbg.cmTried = true;
    const html = await fetchHtml(url, {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
        'Accept': 'text/html',
        'Referer': 'https://www.cardmarket.com/en/Pokemon'
    });
    if (!html) return [];

    const items = [];
    const blockRe = /<div[^>]*class="[^"]*(?:product|article|row)[^"]*"[\s\S]*?>([\s\S]*?)<\/div>/gi;
    let m, idx = 0;
    while ((m = blockRe.exec(html)) !== null && items.length < 60) {
        const block = m[1];
        if (!new RegExp(q,'i').test(block)) continue;
        const name = pick(block, /<a[^>]*>([^<]{3,150})<\/a>/i) || cap(q);
        const setName = pick(block, /<span[^>]*class="[^"]*(?:expansion|set)[^"]*"[^>]*>([^<]+)<\/span>/i) || 'CardMarket';
        const number = pick(block, /(\d+)\s*\/\s*\d+/) || pick(block, /#\s*(\d+)/) || '?';
        let imageUrl = pick(block, /<img[^>]*src="([^"]*\.(?:jpg|jpeg|png|webp))"/i) || '';
        if (imageUrl && !/^https?:/i.test(imageUrl)) imageUrl = `https://www.cardmarket.com${imageUrl}`;

        const eurStr = pick(block, /From\s*€\s*([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{1,2})?)/i) || pick(block, /€\s*([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{1,2})?)/i);
        const prices = [];
        if (eurStr) {
            const eur = parseFloat(eurStr.replace(/\./g,'').replace(',','.'));
            if (eur>0 && eur<100000) prices.push({ grade:'PSA0', price: Math.round(eur*1.1*100), source:'CardMarket', type:'Neohodnoceno' });
        }

        items.push({ id:`cm_${q}_${idx++}`, name, setName, number, imageUrl, prices, priceHistory: [], source:'CardMarket' });
    }
    return items;
}

function pick(s, re) { const m = s.match(re); return m ? m[1].replace(/<[^>]*>/g,'').trim() : null; }
function cap(s) { return s ? s.charAt(0).toUpperCase()+s.slice(1) : s; }


