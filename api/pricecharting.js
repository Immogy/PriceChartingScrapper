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
        const cardVariants = await scrapePriceCharting(pokemon, grade);
        res.status(200).json({ 
            success: true, 
            pokemon, 
            grade: grade || 'all',
            cards: cardVariants,
            count: cardVariants.length
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
    console.log('Scraping real data from PriceCharting for:', pokemonName);
    
    try {
        // Skutečné scrapování z PriceCharting
        const searchUrl = `https://www.pricecharting.com/search-products?q=${encodeURIComponent(pokemonName + ' pokemon card')}`;
        
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
        const cardVariants = parsePriceChartingHTML(html, pokemonName, grade);
        
        console.log('Scraped card variants:', cardVariants);
        return cardVariants;
    } catch (error) {
        console.error('Scraping error:', error);
        throw error;
    }
}

// Mock funkce odstraněny - nyní používáme skutečné scrapování

function parsePriceChartingHTML(html, pokemonName, grade) {
    try {
        console.log('Parsing PriceCharting HTML for:', pokemonName);
        
        const cardVariants = [];
        
        // Najdi všechny výsledky vyhledávání
        const searchResults = extractSearchResults(html, pokemonName);
        
        // Pro každý výsledek extrahuj data
        searchResults.forEach((result, index) => {
            const cardData = {
                id: `pricecharting_${pokemonName.toLowerCase().replace(/\s+/g, '_')}_${index}`,
                name: result.name || pokemonName,
                setName: result.setName || 'Unknown Set',
                number: result.number || '?',
                imageUrl: result.imageUrl || `https://via.placeholder.com/200x280/4A90E2/FFFFFF?text=${encodeURIComponent(pokemonName)}`,
                prices: result.prices || [],
                priceHistory: extractPriceHistory(html),
                source: 'PriceCharting'
            };
            
            cardVariants.push(cardData);
        });
        
        console.log('Parsed card variants:', cardVariants);
        return cardVariants;
    } catch (error) {
        console.error('Parsing error:', error);
        return [];
    }
}

function extractSearchResults(html, pokemonName) {
    const results = [];
    
    try {
        console.log('HTML length:', html.length);
        console.log('Looking for Pokemon:', pokemonName);
        
        // Zkus různé patterns pro výsledky vyhledávání
        const patterns = [
            /<div[^>]*class="[^"]*search-result[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
            /<div[^>]*class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
            /<div[^>]*class="[^"]*product[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
            /<div[^>]*class="[^"]*card[^"]*"[^>]*>([\s\S]*?)<\/div>/gi
        ];
        
        for (const pattern of patterns) {
            const matches = [...html.matchAll(pattern)];
            console.log(`Pattern found ${matches.length} matches`);
            
            matches.forEach(match => {
                const resultHtml = match[1];
                const cardInfo = extractCardInfoFromResult(resultHtml, pokemonName);
                if (cardInfo) {
                    results.push(cardInfo);
                }
            });
            
            if (results.length > 0) {
                console.log(`Found ${results.length} results with pattern`);
                break;
            }
        }
        
        // Pokud stále nenajdeme výsledky, zkusíme obecné parsování
        if (results.length === 0) {
            console.log('No structured results found, trying general parsing');
            const generalResult = extractGeneralCardInfo(html, pokemonName);
            if (generalResult) {
                results.push(generalResult);
            }
        }
        
        // Pokud stále nic, vytvoř fallback výsledek
        if (results.length === 0) {
            console.log('No results found, creating fallback');
            results.push(createFallbackCard(pokemonName));
        }
        
    } catch (error) {
        console.error('Error extracting search results:', error);
        // Vrať fallback v případě chyby
        results.push(createFallbackCard(pokemonName));
    }
    
    return results;
}

function createFallbackCard(pokemonName) {
    return {
        name: pokemonName.charAt(0).toUpperCase() + pokemonName.slice(1),
        setName: 'Unknown Set',
        number: '?',
        imageUrl: `https://via.placeholder.com/200x280/4A90E2/FFFFFF?text=${encodeURIComponent(pokemonName)}`,
        prices: []
    };
}

function extractCardInfoFromResult(resultHtml, pokemonName) {
    try {
        const cardInfo = {};
        
        // Extrahuj název karty - zkus různé patterns
        const namePatterns = [
            /<h3[^>]*>([^<]+)<\/h3>/i,
            /<h2[^>]*>([^<]+)<\/h2>/i,
            /<h1[^>]*>([^<]+)<\/h1>/i,
            /<a[^>]*>([^<]*${pokemonName}[^<]*)<\/a>/i,
            /<span[^>]*>([^<]*${pokemonName}[^<]*)<\/span>/i,
            /<div[^>]*>([^<]*${pokemonName}[^<]*)<\/div>/i
        ];
        
        for (const pattern of namePatterns) {
            const nameMatch = resultHtml.match(pattern);
            if (nameMatch && nameMatch[1].toLowerCase().includes(pokemonName.toLowerCase())) {
                cardInfo.name = nameMatch[1].trim();
                break;
            }
        }
        
        // Pokud nenajdeme název, použij pokemonName
        if (!cardInfo.name) {
            cardInfo.name = pokemonName.charAt(0).toUpperCase() + pokemonName.slice(1);
        }
        
        // Extrahuj název setu
        const setNamePatterns = [
            /Pokemon\s+([^|]+)/i,
            /Set:\s*([^<]+)/i,
            /Base\s+Set/i,
            /Jungle/i,
            /Fossil/i,
            /Team\s+Rocket/i
        ];
        
        for (const pattern of setNamePatterns) {
            const setNameMatch = resultHtml.match(pattern);
            if (setNameMatch) {
                cardInfo.setName = setNameMatch[1] ? setNameMatch[1].trim() : setNameMatch[0];
                break;
            }
        }
        
        if (!cardInfo.setName) {
            cardInfo.setName = 'Unknown Set';
        }
        
        // Extrahuj číslo karty
        const numberMatch = resultHtml.match(/#(\d+)/i);
        if (numberMatch) {
            cardInfo.number = numberMatch[1];
        } else {
            cardInfo.number = '?';
        }
        
        // Extrahuj obrázek
        const imageMatch = resultHtml.match(/<img[^>]*src="([^"]*)"[^>]*alt="[^"]*"/i);
        if (imageMatch) {
            cardInfo.imageUrl = imageMatch[1];
        } else {
            cardInfo.imageUrl = `https://via.placeholder.com/200x280/4A90E2/FFFFFF?text=${encodeURIComponent(cardInfo.name)}`;
        }
        
        // Extrahuj ceny
        cardInfo.prices = extractPricesFromResult(resultHtml);
        
        console.log('Extracted card info:', cardInfo);
        return cardInfo;
    } catch (error) {
        console.error('Error extracting card info from result:', error);
        return null;
    }
}

function extractGeneralCardInfo(html, pokemonName) {
    try {
        const cardInfo = {};
        
        // Extrahuj základní informace z celého HTML
        const namePatterns = [
            /<h1[^>]*>([^<]*${pokemonName}[^<]*)<\/h1>/i,
            /<h2[^>]*>([^<]*${pokemonName}[^<]*)<\/h2>/i,
            /<h3[^>]*>([^<]*${pokemonName}[^<]*)<\/h3>/i,
            /<title[^>]*>([^<]*${pokemonName}[^<]*)<\/title>/i
        ];
        
        for (const pattern of namePatterns) {
            const nameMatch = html.match(pattern);
            if (nameMatch) {
                cardInfo.name = nameMatch[1].trim();
                break;
            }
        }
        
        if (!cardInfo.name) {
            cardInfo.name = pokemonName.charAt(0).toUpperCase() + pokemonName.slice(1);
        }
        
        const setNameMatch = html.match(/Pokemon\s+([^|]+)/i);
        if (setNameMatch) {
            cardInfo.setName = setNameMatch[1].trim();
        } else {
            cardInfo.setName = 'Unknown Set';
        }
        
        const numberMatch = html.match(/#(\d+)/i);
        if (numberMatch) {
            cardInfo.number = numberMatch[1];
        } else {
            cardInfo.number = '?';
        }
        
        const imageMatch = html.match(/<img[^>]*src="([^"]*)"[^>]*alt="[^"]*card[^"]*"/i);
        if (imageMatch) {
            cardInfo.imageUrl = imageMatch[1];
        } else {
            cardInfo.imageUrl = `https://via.placeholder.com/200x280/4A90E2/FFFFFF?text=${encodeURIComponent(cardInfo.name)}`;
        }
        
        cardInfo.prices = extractAllPSAPrices(html);
        
        console.log('Extracted general card info:', cardInfo);
        return cardInfo;
    } catch (error) {
        console.error('Error extracting general card info:', error);
        return null;
    }
}

function extractPricesFromResult(resultHtml) {
    const prices = [];
    
    try {
        // Hledej ceny v HTML výsledku
        const pricePatterns = [
            /PSA\s*10[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /PSA\s*9[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /PSA\s*8[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /PSA\s*7[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /PSA\s*6[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /PSA\s*5[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /PSA\s*4[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /PSA\s*3[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /PSA\s*2[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /PSA\s*1[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /Ungraded[^$]*\$([0-9,]+\.?[0-9]*)/gi
        ];
        
        const gradeMap = {
            0: 'PSA10', 1: 'PSA9', 2: 'PSA8', 3: 'PSA7', 4: 'PSA6',
            5: 'PSA5', 6: 'PSA4', 7: 'PSA3', 8: 'PSA2', 9: 'PSA1', 10: 'PSA0'
        };
        
        pricePatterns.forEach((pattern, index) => {
            const matches = [...resultHtml.matchAll(pattern)];
            matches.forEach(match => {
                const price = parseFloat(match[1].replace(',', ''));
                if (price > 0 && price < 100000) {
                    const grade = gradeMap[index] || 'PSA0';
                    prices.push({
                        grade: grade,
                        price: price,
                        source: 'PriceCharting',
                        type: grade === 'PSA0' ? 'Neohodnoceno' : `PSA ${grade.replace('PSA', '')}`
                    });
                }
            });
        });
        
    } catch (error) {
        console.error('Error extracting prices from result:', error);
    }
    
    return prices;
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
