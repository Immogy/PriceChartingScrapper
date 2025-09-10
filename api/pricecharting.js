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
        const cardData = await scrapePriceCharting(pokemon, grade);
        res.status(200).json({ 
            success: true, 
            pokemon, 
            grade: grade || 'all',
            card: cardData
        });
    } catch (error) {
        console.error('Scraping error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to scrape card data',
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
    try {
        console.log('Parsing PriceCharting HTML for:', pokemonName);
        
        // Extrahuj základní informace o kartě
        const cardInfo = extractCardInfo(html, pokemonName);
        
        // Extrahuj všechny PSA ceny
        const prices = extractAllPSAPrices(html);
        
        // Extrahuj historické ceny pro graf
        const priceHistory = extractPriceHistory(html);
        
        // Vytvoř kompletní data karty
        const cardData = {
            id: `pricecharting_${pokemonName.toLowerCase().replace(/\s+/g, '_')}`,
            name: cardInfo.name || pokemonName,
            setName: cardInfo.setName || 'Pokemon Base Set',
            number: cardInfo.number || '4',
            imageUrl: cardInfo.imageUrl || `https://via.placeholder.com/200x280/4A90E2/FFFFFF?text=${encodeURIComponent(pokemonName)}`,
            prices: prices,
            priceHistory: priceHistory,
            source: 'PriceCharting'
        };

        console.log('Complete card data:', cardData);
        return cardData;
    } catch (error) {
        console.error('Parsing error:', error);
        return {
            id: `pricecharting_${pokemonName.toLowerCase().replace(/\s+/g, '_')}`,
            name: pokemonName,
            setName: 'Pokemon Base Set',
            number: '4',
            imageUrl: `https://via.placeholder.com/200x280/4A90E2/FFFFFF?text=${encodeURIComponent(pokemonName)}`,
            prices: [],
            priceHistory: [],
            source: 'PriceCharting'
        };
    }
}

function extractCardInfo(html, pokemonName) {
    const cardInfo = {};
    
    try {
        // Extrahuj název karty
        const nameMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
        if (nameMatch) {
            cardInfo.name = nameMatch[1].trim();
        }
        
        // Extrahuj název setu
        const setNameMatch = html.match(/Pokemon\s+([^|]+)/i);
        if (setNameMatch) {
            cardInfo.setName = setNameMatch[1].trim();
        }
        
        // Extrahuj číslo karty
        const numberMatch = html.match(/#(\d+)/i);
        if (numberMatch) {
            cardInfo.number = numberMatch[1];
        }
        
        // Extrahuj obrázek karty
        const imageMatch = html.match(/<img[^>]*src="([^"]*)"[^>]*alt="[^"]*card[^"]*"/i);
        if (imageMatch) {
            cardInfo.imageUrl = imageMatch[1];
        }
        
    } catch (error) {
        console.error('Error extracting card info:', error);
    }
    
    return cardInfo;
}

function extractAllPSAPrices(html) {
    const prices = [];
    
    try {
        // PriceCharting má strukturované ceny v tabulkách
        // Hledáme všechny PSA stupně 1-10 + neohodnoceno
        
        // Pattern pro extrakci cen z tabulky
        const priceTablePattern = /<tr[^>]*>[\s\S]*?<td[^>]*>([^<]*)<\/td>[\s\S]*?<td[^>]*>\$([0-9,]+\.?[0-9]*)<\/td>[\s\S]*?<\/tr>/gi;
        const matches = [...html.matchAll(priceTablePattern)];
        
        matches.forEach(match => {
            const gradeText = match[1].trim();
            const price = parseFloat(match[2].replace(',', ''));
            
            // Mapuj text stupně na PSA grade
            const grade = mapGradeTextToPSA(gradeText);
            
            if (grade && price > 0) {
                prices.push({
                    grade: grade,
                    price: price,
                    source: 'PriceCharting',
                    type: grade === 'PSA0' ? 'Neohodnoceno' : `PSA ${grade.replace('PSA', '')}`
                });
            }
        });
        
        // Pokud nenajdeme strukturované ceny, použijeme fallback patterns
        if (prices.length === 0) {
            console.log('No structured prices found, using fallback patterns');
            return extractPricesWithFallback(html);
        }
        
    } catch (error) {
        console.error('Error extracting PSA prices:', error);
    }
    
    return prices;
}

function mapGradeTextToPSA(gradeText) {
    const gradeMap = {
        'Ungraded': 'PSA0',
        'Grade 1': 'PSA1',
        'Grade 2': 'PSA2', 
        'Grade 3': 'PSA3',
        'Grade 4': 'PSA4',
        'Grade 5': 'PSA5',
        'Grade 6': 'PSA6',
        'Grade 7': 'PSA7',
        'Grade 8': 'PSA8',
        'Grade 9': 'PSA9',
        'Grade 10': 'PSA10',
        'PSA 1': 'PSA1',
        'PSA 2': 'PSA2',
        'PSA 3': 'PSA3',
        'PSA 4': 'PSA4',
        'PSA 5': 'PSA5',
        'PSA 6': 'PSA6',
        'PSA 7': 'PSA7',
        'PSA 8': 'PSA8',
        'PSA 9': 'PSA9',
        'PSA 10': 'PSA10'
    };
    
    return gradeMap[gradeText] || null;
}

function extractPricesWithFallback(html) {
    const prices = [];
    
    // Fallback patterns pro všechny PSA stupně
    const psaPatterns = {
        PSA10: [
            /PSA\s*10[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /Grade\s*10[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /10[^$]*\$([0-9,]+\.?[0-9]*)/gi
        ],
        PSA9: [
            /PSA\s*9[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /Grade\s*9[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /9[^$]*\$([0-9,]+\.?[0-9]*)/gi
        ],
        PSA8: [
            /PSA\s*8[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /Grade\s*8[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /8[^$]*\$([0-9,]+\.?[0-9]*)/gi
        ],
        PSA7: [
            /PSA\s*7[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /Grade\s*7[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /7[^$]*\$([0-9,]+\.?[0-9]*)/gi
        ],
        PSA6: [
            /PSA\s*6[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /Grade\s*6[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /6[^$]*\$([0-9,]+\.?[0-9]*)/gi
        ],
        PSA5: [
            /PSA\s*5[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /Grade\s*5[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /5[^$]*\$([0-9,]+\.?[0-9]*)/gi
        ],
        PSA4: [
            /PSA\s*4[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /Grade\s*4[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /4[^$]*\$([0-9,]+\.?[0-9]*)/gi
        ],
        PSA3: [
            /PSA\s*3[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /Grade\s*3[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /3[^$]*\$([0-9,]+\.?[0-9]*)/gi
        ],
        PSA2: [
            /PSA\s*2[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /Grade\s*2[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /2[^$]*\$([0-9,]+\.?[0-9]*)/gi
        ],
        PSA1: [
            /PSA\s*1[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /Grade\s*1[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /1[^$]*\$([0-9,]+\.?[0-9]*)/gi
        ],
        PSA0: [
            /Ungraded[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /Unrated[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /PSA\s*0[^$]*\$([0-9,]+\.?[0-9]*)/gi
        ]
    };

    // Extrahuj ceny pro každý PSA stupeň
    Object.keys(psaPatterns).forEach(grade => {
        const patterns = psaPatterns[grade];
        const seenPrices = new Set();
        
        patterns.forEach(pattern => {
            const matches = [...html.matchAll(pattern)];
            matches.forEach(match => {
                const price = parseFloat(match[1].replace(',', ''));
                const priceKey = `${grade}_${price}`;
                
                if (price > 0 && price < 100000 && !seenPrices.has(priceKey)) {
                    seenPrices.add(priceKey);
                    prices.push({
                        grade: grade,
                        price: price,
                        source: 'PriceCharting',
                        type: grade === 'PSA0' ? 'Neohodnoceno' : `PSA ${grade.replace('PSA', '')}`
                    });
                }
            });
        });
    });
    
    return prices;
}

function extractPriceHistory(html) {
    const priceHistory = [];
    
    try {
        // PriceCharting má historické ceny v grafech nebo tabulkách
        // Prozatím vrátíme mock data pro demonstraci
        const now = new Date();
        const mockHistory = [
            { date: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), price: 8000 },
            { date: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000), price: 8500 },
            { date: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000), price: 9200 },
            { date: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000), price: 9800 },
            { date: now, price: 10276 }
        ];
        
        return mockHistory;
    } catch (error) {
        console.error('Error extracting price history:', error);
        return [];
    }
}
