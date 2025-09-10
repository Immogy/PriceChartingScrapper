// Vercel API endpoint pro PriceCharting scraper
export default async function handler(req, res) {
    // Povolit CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { pokemon, grade } = req.query;

    if (!pokemon) {
        return res.status(400).json({ error: 'Pokemon name is required' });
    }

    try {
        const prices = await scrapePriceCharting(pokemon, grade);
        res.status(200).json({ 
            success: true, 
            pokemon, 
            grade: grade || 'all',
            prices 
        });
    } catch (error) {
        console.error('Scraping error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to scrape prices',
            details: error.message 
        });
    }
}

async function scrapePriceCharting(pokemonName, grade = 'all') {
    const searchUrl = `https://www.pricecharting.com/search-products?q=${encodeURIComponent(pokemonName + ' pokemon card')}`;
    
    try {
        // Použijeme fetch s user-agent
        const response = await fetch(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const html = await response.text();
        return parsePriceChartingHTML(html, pokemonName, grade);
    } catch (error) {
        console.error('Fetch error:', error);
        throw error;
    }
}

function parsePriceChartingHTML(html, pokemonName, grade) {
    const prices = [];
    
    try {
        // Regex patterns pro různé typy cen
        const patterns = {
            // PSA grades
            psa10: /PSA\s*10[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            psa9: /PSA\s*9[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            psa8: /PSA\s*8[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            psa7: /PSA\s*7[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            psa6: /PSA\s*6[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            psa5: /PSA\s*5[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            psa4: /PSA\s*4[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            psa3: /PSA\s*3[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            psa2: /PSA\s*2[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            psa1: /PSA\s*1[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            
            // Obecné ceny
            loose: /\$([0-9,]+\.?[0-9]*)\s*loose/gi,
            complete: /\$([0-9,]+\.?[0-9]*)\s*complete/gi,
            new: /\$([0-9,]+\.?[0-9]*)\s*new/gi,
            used: /\$([0-9,]+\.?[0-9]*)\s*used/gi
        };

        // Extrahuj ceny podle grade
        if (grade === 'all' || grade === 'PSA10') {
            const psa10Matches = [...html.matchAll(patterns.psa10)];
            psa10Matches.forEach(match => {
                prices.push({
                    grade: 'PSA10',
                    price: parseFloat(match[1].replace(',', '')),
                    source: 'PriceCharting',
                    type: 'PSA 10'
                });
            });
        }

        if (grade === 'all' || grade === 'PSA9') {
            const psa9Matches = [...html.matchAll(patterns.psa9)];
            psa9Matches.forEach(match => {
                prices.push({
                    grade: 'PSA9',
                    price: parseFloat(match[1].replace(',', '')),
                    source: 'PriceCharting',
                    type: 'PSA 9'
                });
            });
        }

        if (grade === 'all' || grade === 'PSA8') {
            const psa8Matches = [...html.matchAll(patterns.psa8)];
            psa8Matches.forEach(match => {
                prices.push({
                    grade: 'PSA8',
                    price: parseFloat(match[1].replace(',', '')),
                    source: 'PriceCharting',
                    type: 'PSA 8'
                });
            });
        }

        // Přidej obecné ceny pokud nejsou PSA grades
        if (grade === 'all') {
            const looseMatches = [...html.matchAll(patterns.loose)];
            looseMatches.forEach(match => {
                prices.push({
                    grade: 'LOOSE',
                    price: parseFloat(match[1].replace(',', '')),
                    source: 'PriceCharting',
                    type: 'Loose'
                });
            });
        }

        // Pokud nenajdeme PSA ceny, zkusíme obecné ceny
        if (prices.length === 0) {
            const generalPricePattern = /\$([0-9,]+\.?[0-9]*)/g;
            const generalMatches = [...html.matchAll(generalPricePattern)];
            
            generalMatches.slice(0, 5).forEach(match => {
                const price = parseFloat(match[1].replace(',', ''));
                if (price > 0 && price < 10000) { // Filtruj rozumné ceny
                    prices.push({
                        grade: 'MARKET',
                        price: price,
                        source: 'PriceCharting',
                        type: 'Market Price'
                    });
                }
            });
        }

        return prices;
    } catch (error) {
        console.error('Parsing error:', error);
        return [];
    }
}
