'use strict';

// Serverless handler – čistý scraper bez mocků, zdroje: PriceCharting a CardMarket
module.exports.config = { runtime: 'nodejs18.x' };

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

    const { pokemon } = req.query || {};
    if (!pokemon) return res.status(400).json({ success: false, error: 'pokemon is required' });

    try {
        const pc = await scrapePriceCharting(pokemon);
        if (pc.length) return res.status(200).json({ success: true, source: 'PriceCharting', pokemon, cards: pc, count: pc.length });
        const cm = await scrapeCardMarket(pokemon);
        return res.status(200).json({ success: true, source: 'CardMarket', pokemon, cards: cm, count: cm.length });
    } catch (e) {
        console.error('Handler error:', e);
        return res.status(200).json({ success: true, source: 'none', pokemon, cards: [], count: 0 });
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
async function scrapePriceCharting(q) {
    const url = `https://www.pricecharting.com/search-products?q=${encodeURIComponent(q + ' pokemon card')}`;
    const html = await fetchHtml(url, {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
        'Accept': 'text/html'
    });
    if (!html) return [];

    const items = [];
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let m, idx = 0;
    while ((m = rowRe.exec(html)) !== null && items.length < 60) {
        const row = m[1];
        if (!new RegExp(q, 'i').test(row)) continue;

        const name = pick(row, /<a[^>]*>([^<]{3,150})<\/a>/i) || cap(q);
        const setName = pick(row, /<td[^>]*class="[^"]*(?:set|series|expansion)[^"]*"[^>]*>([^<]+)<\/td>/i) || 'PriceCharting';
        const number = pick(row, /(\d+)\s*\/\s*\d+/) || pick(row, /#\s*(\d+)/) || '?';
        let imageUrl = pick(row, /<img[^>]*src="([^"]*\.(?:jpg|jpeg|png|webp))"/i) || '';
        if (imageUrl && !/^https?:/i.test(imageUrl)) imageUrl = `https://www.pricecharting.com${imageUrl}`;

        const prices = collectPcGrades(row);
        items.push({ id: `pc_${q}_${idx++}`, name, setName, number, imageUrl, prices, priceHistory: [], source: 'PriceCharting' });
    }
    return items;
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
async function scrapeCardMarket(q) {
    const url = `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${encodeURIComponent(q)}`;
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


