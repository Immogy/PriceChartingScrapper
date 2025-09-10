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
        // PriceCharting má jiný formát - hledáme ceny v tabulkách
        console.log('Parsing PriceCharting HTML for:', pokemonName);
        
        // Hledáme PSA ceny v různých formátech - lepší patterns
        const psaPatterns = {
            // PSA 10 - specifické patterns pro PriceCharting
            psa10: [
                /PSA\s*10[^$]*\$([0-9,]+\.?[0-9]*)/gi,
                /Grade\s*10[^$]*\$([0-9,]+\.?[0-9]*)/gi,
                /10[^$]*\$([0-9,]+\.?[0-9]*)/gi
            ],
            // PSA 9
            psa9: [
                /PSA\s*9[^$]*\$([0-9,]+\.?[0-9]*)/gi,
                /Grade\s*9[^$]*\$([0-9,]+\.?[0-9]*)/gi,
                /9[^$]*\$([0-9,]+\.?[0-9]*)/gi
            ],
            // PSA 8
            psa8: [
                /PSA\s*8[^$]*\$([0-9,]+\.?[0-9]*)/gi,
                /Grade\s*8[^$]*\$([0-9,]+\.?[0-9]*)/gi,
                /8[^$]*\$([0-9,]+\.?[0-9]*)/gi
            ],
            // PSA 0 - Neohodnocené karty
            psa0: [
                /PSA\s*0[^$]*\$([0-9,]+\.?[0-9]*)/gi,
                /Grade\s*0[^$]*\$([0-9,]+\.?[0-9]*)/gi,
                /Ungraded[^$]*\$([0-9,]+\.?[0-9]*)/gi,
                /Unrated[^$]*\$([0-9,]+\.?[0-9]*)/gi
            ]
        };
        
        // Obecné ceny
        const generalPatterns = [
            /\$([0-9,]+\.?[0-9]*)/g,
            /([0-9,]+\.?[0-9]*)\s*USD/g,
            /Price:\s*\$([0-9,]+\.?[0-9]*)/gi
        ];

        // Extrahuj PSA ceny s lepším filtrováním
        Object.keys(psaPatterns).forEach(gradeKey => {
            const gradePatterns = psaPatterns[gradeKey];
            const gradeNumber = gradeKey.slice(-1);
            const seenPrices = new Set(); // Zabránit duplicitám
            
            gradePatterns.forEach(pattern => {
                const matches = [...html.matchAll(pattern)];
                matches.forEach(match => {
                    const price = parseFloat(match[1].replace(',', ''));
                    const priceKey = `${gradeKey}_${price}`;
                    
                    // Filtruj rozumné ceny a duplicity
                    if (price > 1 && price < 10000 && !seenPrices.has(priceKey)) {
                        seenPrices.add(priceKey);
                        prices.push({
                            grade: gradeKey.toUpperCase(),
                            price: price,
                            source: 'PriceCharting',
                            type: gradeNumber === '0' ? 'Neohodnocené' : `PSA ${gradeNumber}`
                        });
                    }
                });
            });
        });

        // Pokud nenajdeme PSA ceny, zkusíme obecné ceny
        if (prices.length === 0) {
            console.log('No PSA prices found, trying general patterns');
            generalPatterns.forEach(pattern => {
                const matches = [...html.matchAll(pattern)];
                matches.slice(0, 3).forEach(match => {
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
            });
        }

        // Omezení na maximálně 5 cen per grade
        const limitedPrices = [];
        const gradeCounts = { PSA10: 0, PSA9: 0, PSA8: 0, PSA0: 0 };
        
        prices.forEach(price => {
            if (gradeCounts[price.grade] < 5) {
                limitedPrices.push(price);
                gradeCounts[price.grade]++;
            }
        });
        
        console.log('Extracted prices (limited):', limitedPrices);
        return limitedPrices;
    } catch (error) {
        console.error('Parsing error:', error);
        return [];
    }
}
