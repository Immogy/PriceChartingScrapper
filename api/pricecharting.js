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
        let cardVariants = [];
        let source = 'none';
        
        console.log(`=== SCRAPER STARTED for: ${pokemon} ===`);
        
        // Zkus nejprve PriceCharting
        try {
            console.log('Trying PriceCharting first...');
            cardVariants = await scrapePriceCharting(pokemon, grade);
            source = 'PriceCharting';
            console.log(`PriceCharting success: ${cardVariants.length} cards`);
            
            // Pokud PriceCharting vrátí prázdné výsledky, zkus CardMarket
            if (cardVariants.length === 0) {
                console.log('PriceCharting returned empty results, trying CardMarket...');
                cardVariants = await scrapeCardMarket(pokemon, grade);
                source = 'CardMarket';
                console.log(`CardMarket success: ${cardVariants.length} cards`);
            }
        } catch (priceChartingError) {
            console.log('PriceCharting failed:', priceChartingError.message);
            
            // Fallback na CardMarket
            try {
                console.log('Trying CardMarket as fallback...');
                cardVariants = await scrapeCardMarket(pokemon, grade);
                source = 'CardMarket';
                console.log(`CardMarket success: ${cardVariants.length} cards`);
            } catch (cardMarketError) {
                console.log('CardMarket also failed:', cardMarketError.message);
                
                // Pokud oba selžou, vytvoř alespoň základní kartu s reálnými daty
                console.log('Creating basic card with real data...');
                cardVariants = [createBasicCard(pokemon)];
                source = 'Basic';
                console.log(`Basic card created: ${cardVariants.length} cards`);
            }
        }
        
        res.status(200).json({ 
            success: true, 
            pokemon, 
            grade: grade || 'all',
            cards: cardVariants,
            count: cardVariants.length,
            source: source
        });
    } catch (error) {
        console.error('All scraping failed:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to scrape card data from all sources',
            details: error.message 
        });
    }
}

async function scrapePriceCharting(pokemonName, grade = 'all') {
    console.log('Scraping REAL data from PriceCharting for:', pokemonName);
    
    try {
        // Skutečné scrapování z PriceCharting s timeout
        const searchUrl = `https://www.pricecharting.com/search-products?q=${encodeURIComponent(pokemonName + ' pokemon card')}`;
        console.log('Search URL:', searchUrl);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 sekund timeout
        
        const response = await fetch(searchUrl, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Cache-Control': 'max-age=0'
            }
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
        }

        const html = await response.text();
        console.log('HTML received, length:', html.length);
        
        if (html.length < 1000) {
            throw new Error('Received HTML is too short, likely an error page');
        }
        
        const cardVariants = parsePriceChartingHTML(html, pokemonName, grade);
        console.log('Parsed card variants:', cardVariants);
        
        if (cardVariants.length === 0) {
            throw new Error('No card variants found in HTML');
        }
        
        return cardVariants;
        
    } catch (error) {
        console.error('Scraping error:', error);
        throw error; // Propaga chybu místo vracení fallback
    }
}

// Mock funkce odstraněny - nyní používáme pouze skutečné scrapování

// Mock funkce odstraněny - nyní používáme skutečné scrapování

function parsePriceChartingHTML(html, pokemonName, grade) {
    try {
        console.log('Parsing PriceCharting HTML for:', pokemonName);
        
        const cardVariants = [];
        
        // Hledej konkrétní karty v HTML
        const cardMatches = findCardMatches(html, pokemonName);
        console.log('Found card matches:', cardMatches.length);
        
        cardMatches.forEach((match, index) => {
            const cardData = extractCardFromMatch(match, pokemonName, index);
            if (cardData) {
                cardVariants.push(cardData);
            }
        });
        
        // Pokud nenajdeme žádné karty, zkusíme obecné hledání
        if (cardVariants.length === 0) {
            console.log('No specific cards found, trying general search');
            const generalCard = extractGeneralCard(html, pokemonName);
            if (generalCard) {
                cardVariants.push(generalCard);
            }
        }
        
        console.log('Parsed card variants:', cardVariants);
        return cardVariants;
    } catch (error) {
        console.error('Parsing error:', error);
        return [];
    }
}

function findCardMatches(html, pokemonName) {
    const matches = [];
    
    console.log('Searching for Pokemon:', pokemonName);
    
    // Hledej různé patterns pro karty - specifické pro PriceCharting
    const patterns = [
        // PriceCharting specific patterns
        /<tr[^>]*class="[^"]*product[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi,
        /<div[^>]*class="[^"]*product[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
        /<div[^>]*class="[^"]*search-result[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
        /<div[^>]*class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
        /<div[^>]*class="[^"]*item[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
        // Pattern pro odkazy na karty
        /<a[^>]*href="[^"]*pokemon[^"]*"[^>]*>([\s\S]*?)<\/a>/gi,
        // Pattern pro tabulky s kartami
        /<tr[^>]*>([\s\S]*?)<\/tr>/gi,
        // Pattern pro listy karet
        /<li[^>]*>([\s\S]*?)<\/li>/gi
    ];
    
    patterns.forEach((pattern, patternIndex) => {
        const patternMatches = [...html.matchAll(pattern)];
        console.log(`Pattern ${patternIndex} found ${patternMatches.length} matches`);
        
        patternMatches.forEach(match => {
            if (match[1] && match[1].toLowerCase().includes(pokemonName.toLowerCase())) {
                console.log(`Found match for ${pokemonName}:`, match[1].substring(0, 200));
                matches.push(match[1]);
            }
        });
    });
    
    console.log(`Total matches found: ${matches.length}`);
    return matches;
}

function extractCardFromMatch(matchHtml, pokemonName, index) {
    try {
        console.log('Extracting card from match:', matchHtml.substring(0, 200));
        
        const cardData = {
            id: `pricecharting_${pokemonName.toLowerCase().replace(/\s+/g, '_')}_${index}`,
            name: pokemonName.charAt(0).toUpperCase() + pokemonName.slice(1),
            setName: 'Unknown Set',
            number: '?',
            imageUrl: null, // Pouze skutečné obrázky z HTML
            prices: [],
            priceHistory: [],
            source: 'PriceCharting'
        };
        
        // Extrahuj název karty z HTML
        const namePatterns = [
            /<h[1-6][^>]*>([^<]*${pokemonName}[^<]*)<\/h[1-6]>/i,
            /<a[^>]*>([^<]*${pokemonName}[^<]*)<\/a>/i,
            /<span[^>]*>([^<]*${pokemonName}[^<]*)<\/span>/i,
            /<div[^>]*>([^<]*${pokemonName}[^<]*)<\/div>/i
        ];
        
        for (const pattern of namePatterns) {
            const nameMatch = matchHtml.match(pattern);
            if (nameMatch && nameMatch[1]) {
                cardData.name = nameMatch[1].trim();
                break;
            }
        }
        
        // Extrahuj název setu - rozšířené patterns pro lepší pokrytí
        const setNamePatterns = [
            // Obecné patterns
            /Pokemon\s+([^|<>]+)/i,
            /Set:\s*([^|<>]+)/i,
            /Series:\s*([^|<>]+)/i,
            /Expansion:\s*([^|<>]+)/i,
            // Klasické sady
            /Base\s+Set/i,
            /Jungle/i,
            /Fossil/i,
            /Team\s+Rocket/i,
            /Gym\s+Challenge/i,
            /Gym\s+Heroes/i,
            /Neo\s+Genesis/i,
            /Neo\s+Discovery/i,
            /Neo\s+Revelation/i,
            /Neo\s+Destiny/i,
            /Expedition/i,
            /Aquapolis/i,
            /Skyridge/i,
            // Moderní sady
            /Ruby\s+&amp;\s+Sapphire/i,
            /Diamond\s+&amp;\s+Pearl/i,
            /Platinum/i,
            /HeartGold\s+&amp;\s+SoulSilver/i,
            /Black\s+&amp;\s+White/i,
            /XY/i,
            /Sun\s+&amp;\s+Moon/i,
            /Sword\s+&amp;\s+Shield/i,
            /Brilliant\s+Stars/i,
            /Astral\s+Radiance/i,
            /Lost\s+Origin/i,
            /Silver\s+Tempest/i,
            /Scarlet\s+&amp;\s+Violet/i,
            /151/i,
            /Base\s+Set\s+2/i,
            /Legendary\s+Collection/i,
            /Ex\s+Ruby\s+&amp;\s+Sapphire/i,
            /Ex\s+FireRed\s+&amp;\s+LeafGreen/i,
            /Ex\s+Team\s+Rocket\s+Returns/i,
            /Ex\s+Deoxys/i,
            /Ex\s+Emerald/i,
            /Ex\s+Unseen\s+Forces/i,
            /Ex\s+Delta\s+Species/i,
            /Ex\s+Legend\s+Maker/i,
            /Ex\s+Holon\s+Phantoms/i,
            /Ex\s+Crystal\s+Guardians/i,
            /Ex\s+Dragon\s+Frontiers/i,
            /Ex\s+Power\s+Keepers/i
        ];
        
        for (const pattern of setNamePatterns) {
            const setNameMatch = matchHtml.match(pattern);
            if (setNameMatch) {
                let setName = setNameMatch[1] ? setNameMatch[1].trim() : setNameMatch[0];
                // Vyčisti název setu od HTML tagů a nechtěných znaků
                setName = setName.replace(/<[^>]*>/g, '').replace(/loading=lazy/g, '').replace(/\/\s*#\?/g, '').trim();
                if (setName && setName !== 'loading=lazy' && setName !== '#?') {
                    cardData.setName = setName;
                    break;
                }
            }
        }
        
        // Extrahuj číslo karty - rozšířené patterns
        const numberPatterns = [
            /#(\d+)/i,
            /No\.\s*(\d+)/i,
            /Number\s*(\d+)/i,
            /Card\s*(\d+)/i
        ];
        
        for (const pattern of numberPatterns) {
            const numberMatch = matchHtml.match(pattern);
            if (numberMatch) {
                let number = numberMatch[1];
                // Vyčisti číslo karty od nechtěných znaků
                number = number.replace(/[^\d]/g, '');
                if (number && number !== '?') {
                    cardData.number = number;
                    break;
                }
            }
        }
        
        // Extrahuj obrázek - lepší patterns pro vysoce kvalitní obrázky
        const imagePatterns = [
            // Prioritizuj vysoce kvalitní obrázky
            /<img[^>]*src="([^"]*(?:large|hires|high|big)[^"]*\.(?:jpg|jpeg|png|webp))"[^>]*/i,
            /<img[^>]*src="([^"]*\.(?:jpg|jpeg|png|webp))"[^>]*alt="[^"]*"/i,
            /<img[^>]*alt="[^"]*"[^>]*src="([^"]*\.(?:jpg|jpeg|png|webp))"/i,
            /<img[^>]*src="([^"]*)"[^>]*class="[^"]*card[^"]*"/i,
            /<img[^>]*class="[^"]*card[^"]*"[^>]*src="([^"]*)"[^>]*/i,
            /<img[^>]*src="([^"]*)"[^>]*width="[^"]*"[^>]*height="[^"]*"/i,
            // Další patterns pro obrázky
            /<img[^>]*src="([^"]*)"[^>]*class="[^"]*product[^"]*"/i,
            /<img[^>]*src="([^"]*)"[^>]*class="[^"]*image[^"]*"/i,
            /<img[^>]*src="([^"]*)"[^>]*class="[^"]*photo[^"]*"/i
        ];
        
        for (const pattern of imagePatterns) {
            const imageMatch = matchHtml.match(pattern);
            if (imageMatch && imageMatch[1]) {
                let imageUrl = imageMatch[1];
                // Zajisti, že URL je kompletní
                if (imageUrl.startsWith('//')) {
                    imageUrl = 'https:' + imageUrl;
                } else if (imageUrl.startsWith('/')) {
                    imageUrl = 'https://www.pricecharting.com' + imageUrl;
                }
                // Ověř, že je to skutečný obrázek a má dobrou kvalitu
                if (imageUrl.includes('.') && (imageUrl.includes('jpg') || imageUrl.includes('png') || imageUrl.includes('webp'))) {
                    // Prioritizuj vysoce kvalitní obrázky
                    if (imageUrl.includes('large') || imageUrl.includes('hires') || imageUrl.includes('high') || imageUrl.includes('big')) {
                        cardData.imageUrl = imageUrl;
                        break;
                    } else if (!cardData.imageUrl) {
                        // Použij jako fallback pouze pokud nemáme lepší
                        cardData.imageUrl = imageUrl;
                    }
                }
            }
        }
        
        // Pokud se nepodařilo extrahovat obrázek z HTML, zkus Pokémon TCG API
        if (!cardData.imageUrl) {
            console.log('No real image found in HTML for:', pokemonName);
            try {
                const response = await fetch(`https://api.pokemontcg.io/v2/cards?q=name:"${pokemonName}"&pageSize=1`);
                const data = await response.json();
                if (data.data && data.data.length > 0) {
                    cardData.imageUrl = data.data[0].images.large || data.data[0].images.small;
                    console.log('Found image from Pokémon TCG API:', cardData.imageUrl);
                }
            } catch (error) {
                console.log('Failed to fetch image from Pokémon TCG API:', error.message);
            }
        }
        
        // Extrahuj ceny
        cardData.prices = extractRealPrices(matchHtml);
        
        console.log('Extracted card data:', cardData);
        return cardData;
    } catch (error) {
        console.error('Error extracting card from match:', error);
        return null;
    }
}

function extractGeneralCard(html, pokemonName) {
    try {
        const cardData = {
            id: `pricecharting_${pokemonName.toLowerCase().replace(/\s+/g, '_')}_general`,
            name: pokemonName.charAt(0).toUpperCase() + pokemonName.slice(1),
            setName: 'Unknown Set',
            number: '?',
            imageUrl: null, // Pouze skutečné obrázky z HTML
            prices: [],
            priceHistory: [],
            source: 'PriceCharting'
        };
        
        // Extrahuj ceny z celého HTML
        cardData.prices = extractRealPrices(html);
        
        return cardData;
    } catch (error) {
        console.error('Error extracting general card:', error);
        return null;
    }
}

function extractRealPrices(html) {
    const prices = [];
    
    try {
        console.log('Extracting real prices from HTML...');
        
        // Hledej skutečné ceny v HTML - maximálně rozšířené patterns
        const pricePatterns = [
            // PSA ceny s různými formáty - více variant
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
            /PSA\s*0[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /Ungraded[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /Unrated[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /Raw[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            // Grade ceny
            /Grade\s*10[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /Grade\s*9[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /Grade\s*8[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /Grade\s*7[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /Grade\s*6[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /Grade\s*5[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /Grade\s*4[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /Grade\s*3[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /Grade\s*2[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /Grade\s*1[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /Grade\s*0[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            // Alternativní formáty
            /G\s*10[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /G\s*9[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /G\s*8[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /G\s*7[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /G\s*6[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /G\s*5[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /G\s*4[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /G\s*3[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /G\s*2[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /G\s*1[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            // Další formáty cen
            /10[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /9[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /8[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /7[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /6[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /5[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /4[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /3[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /2[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            /1[^$]*\$([0-9,]+\.?[0-9]*)/gi,
            // Obecné ceny - více variant
            /\$([0-9,]+\.?[0-9]*)/g,
            /Price:\s*\$([0-9,]+\.?[0-9]*)/gi,
            /Value:\s*\$([0-9,]+\.?[0-9]*)/gi,
            /Cost:\s*\$([0-9,]+\.?[0-9]*)/gi,
            /Sell:\s*\$([0-9,]+\.?[0-9]*)/gi,
            /Buy:\s*\$([0-9,]+\.?[0-9]*)/gi,
            /Market:\s*\$([0-9,]+\.?[0-9]*)/gi
        ];
        
        const gradeMap = {
            // PSA patterns (0-10)
            0: 'PSA10', 1: 'PSA9', 2: 'PSA8', 3: 'PSA7', 4: 'PSA6',
            5: 'PSA5', 6: 'PSA4', 7: 'PSA3', 8: 'PSA2', 9: 'PSA1', 10: 'PSA0',
            // Grade patterns (11-21)
            11: 'PSA10', 12: 'PSA9', 13: 'PSA8', 14: 'PSA7', 15: 'PSA6',
            16: 'PSA5', 17: 'PSA4', 18: 'PSA3', 19: 'PSA2', 20: 'PSA1', 21: 'PSA0',
            // G patterns (22-31)
            22: 'PSA10', 23: 'PSA9', 24: 'PSA8', 25: 'PSA7', 26: 'PSA6',
            27: 'PSA5', 28: 'PSA4', 29: 'PSA3', 30: 'PSA2', 31: 'PSA1',
            // Number patterns (32-41)
            32: 'PSA10', 33: 'PSA9', 34: 'PSA8', 35: 'PSA7', 36: 'PSA6',
            37: 'PSA5', 38: 'PSA4', 39: 'PSA3', 40: 'PSA2', 41: 'PSA1',
            // General prices (42+)
            42: 'PSA0', 43: 'PSA0', 44: 'PSA0', 45: 'PSA0', 46: 'PSA0', 47: 'PSA0', 48: 'PSA0'
        };
        
        pricePatterns.forEach((pattern, index) => {
            const matches = [...html.matchAll(pattern)];
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
        
        // Žádné mock data - pouze skutečné ceny z PriceCharting
        if (prices.length === 0) {
            console.log('No real prices found from PriceCharting');
            return [];
        }
        
        // Odstraň duplicity a seřaď podle PSA stupně
        const uniquePrices = [];
        const seenGrades = new Set();
        
        prices.forEach(price => {
            if (!seenGrades.has(price.grade)) {
                seenGrades.add(price.grade);
                uniquePrices.push(price);
            }
        });
        
        // Seřaď podle PSA stupně (10, 9, 8, ..., 1, 0)
        uniquePrices.sort((a, b) => {
            const gradeA = parseInt(a.grade.replace('PSA', ''));
            const gradeB = parseInt(b.grade.replace('PSA', ''));
            return gradeB - gradeA;
        });
        
        console.log('Extracted real prices:', uniquePrices);
        return uniquePrices;
        
    } catch (error) {
        console.error('Error extracting real prices:', error);
        return [];
    }
}

// Funkce extractSearchResults byla přesunuta do findCardMatches

function createFallbackCard(pokemonName) {
    return {
        name: pokemonName.charAt(0).toUpperCase() + pokemonName.slice(1),
        setName: 'Unknown Set',
        number: '?',
        imageUrl: getPokemonCardImage(pokemonName, 0),
        prices: [] // Žádné mock ceny - pouze skutečné data
    };
}

// Funkce extractCardInfoFromResult byla integrována do extractCardFromMatch

// Funkce extractGeneralCardInfo byla integrována do extractGeneralCard

// Funkce extractPricesFromResult byla integrována do extractRealPrices

// Funkce extractCardInfo byla integrována do extractCardFromMatch

// Funkce extractAllPSAPrices byla integrována do extractRealPrices

// Funkce mapGradeTextToPSA byla integrována do extractRealPrices

// Funkce extractPricesWithFallback byla integrována do extractRealPrices

function getPokemonCardImage(pokemonName, index) {
    const pokemon = pokemonName.toLowerCase();

    // Mapování populárních Pokémon na jejich obrázky z Pokémon TCG API
    const cardImages = {
        'charizard': [
            'https://images.pokemontcg.io/base1/4_hires.png',
            'https://images.pokemontcg.io/xy12/12_hires.png',
            'https://images.pokemontcg.io/swsh4/074_hires.png',
            'https://images.pokemontcg.io/sv3pt5/223_hires.png'
        ],
        'pikachu': [
            'https://images.pokemontcg.io/base1/58_hires.png',
            'https://images.pokemontcg.io/xy12/20_hires.png',
            'https://images.pokemontcg.io/sv3pt5/025_hires.png'
        ],
        'blastoise': [
            'https://images.pokemontcg.io/base1/2_hires.png',
            'https://images.pokemontcg.io/xy12/2_hires.png',
            'https://images.pokemontcg.io/sv3pt5/009_hires.png'
        ],
        'venusaur': [
            'https://images.pokemontcg.io/base1/15_hires.png',
            'https://images.pokemontcg.io/xy12/1_hires.png',
            'https://images.pokemontcg.io/sv3pt5/003_hires.png'
        ],
        'mewtwo': [
            'https://images.pokemontcg.io/base1/10_hires.png',
            'https://images.pokemontcg.io/xy12/52_hires.png',
            'https://images.pokemontcg.io/sv3pt5/150_hires.png'
        ]
    };

    const images = cardImages[pokemon] || cardImages['pikachu'];
    return images[index % images.length] || images[0];
}

// Funkce pro vytvoření základní karty s reálnými daty z Pokémon TCG API
async function createBasicCard(pokemonName) {
    console.log('Creating basic card with real data for:', pokemonName);
    
    try {
        // Zkus získat reálná data z Pokémon TCG API
        const response = await fetch(`https://api.pokemontcg.io/v2/cards?q=name:"${pokemonName}"&pageSize=1`);
        const data = await response.json();
        
        if (data.data && data.data.length > 0) {
            const card = data.data[0];
            return {
                id: `basic_${pokemonName.toLowerCase().replace(/\s+/g, '_')}`,
                name: card.name,
                setName: card.set.name,
                number: card.number || '?',
                imageUrl: card.images.large || card.images.small,
                prices: [
                    {
                        grade: 'PSA0',
                        price: 1000, // $10 jako základní cena
                        source: 'Basic',
                        type: 'Neohodnoceno'
                    }
                ],
                priceHistory: [],
                source: 'Basic'
            };
        }
    } catch (error) {
        console.log('Failed to fetch from Pokémon TCG API:', error.message);
    }
    
    // Fallback s minimálními daty
    return {
        id: `basic_${pokemonName.toLowerCase().replace(/\s+/g, '_')}`,
        name: pokemonName.charAt(0).toUpperCase() + pokemonName.slice(1),
        setName: 'Unknown Set',
        number: '?',
        imageUrl: null,
        prices: [],
        priceHistory: [],
        source: 'Basic'
    };
}


// CardMarket scraper
async function scrapeCardMarket(pokemonName, grade = 'all') {
    console.log('Scraping REAL data from CardMarket for:', pokemonName);
    
    try {
        // CardMarket search URL
        const searchUrl = `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${encodeURIComponent(pokemonName)}`;
        console.log('CardMarket Search URL:', searchUrl);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 sekund timeout
        
        const response = await fetch(searchUrl, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Cache-Control': 'max-age=0'
            }
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
        }

        const html = await response.text();
        console.log('CardMarket HTML received, length:', html.length);
        
        if (html.length < 1000) {
            throw new Error('Received HTML is too short, likely an error page');
        }
        
        const cardVariants = parseCardMarketHTML(html, pokemonName, grade);
        console.log('Parsed CardMarket card variants:', cardVariants);
        
        if (cardVariants.length === 0) {
            throw new Error('No card variants found in CardMarket HTML');
        }
        
        return cardVariants;
        
    } catch (error) {
        console.error('CardMarket scraping error:', error);
        throw error;
    }
}

function parseCardMarketHTML(html, pokemonName, grade) {
    try {
        console.log('Parsing CardMarket HTML for:', pokemonName);
        
        const cardVariants = [];
        
        // Hledej karty v CardMarket HTML
        const cardMatches = findCardMarketMatches(html, pokemonName);
        console.log('Found CardMarket card matches:', cardMatches.length);
        
        cardMatches.forEach((match, index) => {
            const cardData = extractCardFromCardMarketMatch(match, pokemonName, index);
            if (cardData) {
                cardVariants.push(cardData);
            }
        });
        
        console.log('Parsed CardMarket card variants:', cardVariants);
        return cardVariants;
    } catch (error) {
        console.error('CardMarket parsing error:', error);
        return [];
    }
}

function findCardMarketMatches(html, pokemonName) {
    const matches = [];
    
    console.log('Searching CardMarket for Pokemon:', pokemonName);
    
    // CardMarket specific patterns
    const patterns = [
        // CardMarket product rows
        /<tr[^>]*class="[^"]*product[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi,
        /<div[^>]*class="[^"]*product[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
        /<div[^>]*class="[^"]*search-result[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
        /<div[^>]*class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
        // CardMarket specific patterns
        /<div[^>]*class="[^"]*card[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
        /<a[^>]*href="[^"]*Pokemon[^"]*"[^>]*>([\s\S]*?)<\/a>/gi
    ];
    
    patterns.forEach((pattern, patternIndex) => {
        const patternMatches = [...html.matchAll(pattern)];
        console.log(`CardMarket Pattern ${patternIndex} found ${patternMatches.length} matches`);
        
        patternMatches.forEach(match => {
            if (match[1] && match[1].toLowerCase().includes(pokemonName.toLowerCase())) {
                console.log(`Found CardMarket match for ${pokemonName}:`, match[1].substring(0, 200));
                matches.push(match[1]);
            }
        });
    });
    
    console.log(`Total CardMarket matches found: ${matches.length}`);
    return matches;
}

function extractCardFromCardMarketMatch(matchHtml, pokemonName, index) {
    try {
        console.log('Extracting card from CardMarket match:', matchHtml.substring(0, 200));
        
        const cardData = {
            id: `cardmarket_${pokemonName.toLowerCase().replace(/\s+/g, '_')}_${index}`,
            name: pokemonName.charAt(0).toUpperCase() + pokemonName.slice(1),
            setName: 'Unknown Set',
            number: '?',
            imageUrl: null, // Pouze skutečné obrázky z HTML
            prices: [],
            priceHistory: [],
            source: 'CardMarket'
        };
        
        // Extrahuj název karty z CardMarket HTML
        const namePatterns = [
            /<h[1-6][^>]*>([^<]*${pokemonName}[^<]*)<\/h[1-6]>/i,
            /<a[^>]*>([^<]*${pokemonName}[^<]*)<\/a>/i,
            /<span[^>]*>([^<]*${pokemonName}[^<]*)<\/span>/i,
            /<div[^>]*>([^<]*${pokemonName}[^<]*)<\/div>/i
        ];
        
        for (const pattern of namePatterns) {
            const nameMatch = matchHtml.match(pattern);
            if (nameMatch && nameMatch[1]) {
                cardData.name = nameMatch[1].trim();
                break;
            }
        }
        
        // Extrahuj název setu z CardMarket
        const setNamePatterns = [
            /Pokemon\s+([^|<>]+)/i,
            /Base\s+Set/i,
            /Jungle/i,
            /Fossil/i,
            /Team\s+Rocket/i,
            /Gym\s+Challenge/i,
            /Gym\s+Heroes/i,
            /Neo\s+Genesis/i,
            /Neo\s+Discovery/i,
            /Neo\s+Revelation/i,
            /Neo\s+Destiny/i,
            /Expedition/i,
            /Aquapolis/i,
            /Skyridge/i,
            /Ruby\s+&amp;\s+Sapphire/i,
            /Diamond\s+&amp;\s+Pearl/i,
            /Platinum/i,
            /HeartGold\s+&amp;\s+SoulSilver/i,
            /Black\s+&amp;\s+White/i,
            /XY/i,
            /Sun\s+&amp;\s+Moon/i,
            /Sword\s+&amp;\s+Shield/i,
            /Brilliant\s+Stars/i,
            /Astral\s+Radiance/i,
            /Lost\s+Origin/i,
            /Silver\s+Tempest/i,
            /Scarlet\s+&amp;\s+Violet/i
        ];
        
        for (const pattern of setNamePatterns) {
            const setNameMatch = matchHtml.match(pattern);
            if (setNameMatch) {
                let setName = setNameMatch[1] ? setNameMatch[1].trim() : setNameMatch[0];
                setName = setName.replace(/<[^>]*>/g, '').replace(/loading=lazy/g, '').replace(/\/\s*#\?/g, '').trim();
                if (setName && setName !== 'loading=lazy' && setName !== '#?') {
                    cardData.setName = setName;
                    break;
                }
            }
        }
        
        // Extrahuj číslo karty - rozšířené patterns
        const numberPatterns = [
            /#(\d+)/i,
            /No\.\s*(\d+)/i,
            /Number\s*(\d+)/i,
            /Card\s*(\d+)/i,
            /(\d+)\/\d+/i, // Formát "4/102"
            /Card\s*#\s*(\d+)/i,
            /No\s*(\d+)/i,
            /(\d+)\s*of\s*\d+/i,
            /(\d+)\s*\/\s*\d+/i
        ];
        
        for (const pattern of numberPatterns) {
            const numberMatch = matchHtml.match(pattern);
            if (numberMatch) {
                let number = numberMatch[1];
                number = number.replace(/[^\d]/g, '');
                if (number && number !== '?') {
                    cardData.number = number;
                    break;
                }
            }
        }
        
        // Extrahuj obrázek - lepší patterns pro CardMarket
        const imagePatterns = [
            /<img[^>]*src="([^"]*\.(?:jpg|jpeg|png|webp|gif))"[^>]*alt="[^"]*"/i,
            /<img[^>]*alt="[^"]*"[^>]*src="([^"]*\.(?:jpg|jpeg|png|webp|gif))"/i,
            /<img[^>]*src="([^"]*)"[^>]*class="[^"]*product[^"]*"/i,
            /<img[^>]*class="[^"]*product[^"]*"[^>]*src="([^"]*)"[^>]*/i,
            /<img[^>]*src="([^"]*)"[^>]*width="[^"]*"[^>]*height="[^"]*"/i
        ];
        
        for (const pattern of imagePatterns) {
            const imageMatch = matchHtml.match(pattern);
            if (imageMatch && imageMatch[1]) {
                let imageUrl = imageMatch[1];
                // Zajisti, že URL je kompletní
                if (imageUrl.startsWith('//')) {
                    imageUrl = 'https:' + imageUrl;
                } else if (imageUrl.startsWith('/')) {
                    imageUrl = 'https://www.cardmarket.com' + imageUrl;
                }
                // Ověř, že je to skutečný obrázek
                if (imageUrl.includes('.') && (imageUrl.includes('jpg') || imageUrl.includes('png') || imageUrl.includes('webp'))) {
                    cardData.imageUrl = imageUrl;
                    break;
                }
            }
        }
        
        // Pokud se nepodařilo extrahovat obrázek z HTML, zkus Pokémon TCG API
        if (!cardData.imageUrl) {
            console.log('No real image found in HTML for:', pokemonName);
            try {
                const response = await fetch(`https://api.pokemontcg.io/v2/cards?q=name:"${pokemonName}"&pageSize=1`);
                const data = await response.json();
                if (data.data && data.data.length > 0) {
                    cardData.imageUrl = data.data[0].images.large || data.data[0].images.small;
                    console.log('Found image from Pokémon TCG API:', cardData.imageUrl);
                }
            } catch (error) {
                console.log('Failed to fetch image from Pokémon TCG API:', error.message);
            }
        }
        
        // Extrahuj ceny z CardMarket
        cardData.prices = extractCardMarketPrices(matchHtml);
        
        console.log('Extracted CardMarket card data:', cardData);
        return cardData;
    } catch (error) {
        console.error('Error extracting card from CardMarket match:', error);
        return null;
    }
}

function extractCardMarketPrices(html) {
    const prices = [];
    
    try {
        console.log('Extracting CardMarket prices from HTML...');
        
        // CardMarket price patterns
        const pricePatterns = [
            // CardMarket specific price patterns
            /€([0-9,]+\.?[0-9]*)/g,
            /\$([0-9,]+\.?[0-9]*)/g,
            /Price:\s*([0-9,]+\.?[0-9]*)/gi,
            /From:\s*([0-9,]+\.?[0-9]*)/gi,
            /To:\s*([0-9,]+\.?[0-9]*)/gi
        ];
        
        pricePatterns.forEach((pattern, index) => {
            const matches = [...html.matchAll(pattern)];
            matches.forEach(match => {
                const price = parseFloat(match[1].replace(',', ''));
                if (price > 0 && price < 100000) {
                    // CardMarket ceny jsou v EUR, převedeme na USD (přibližně)
                    const priceUSD = Math.round(price * 1.1 * 100); // EUR to USD conversion
                    
                    prices.push({
                        grade: 'PSA0', // CardMarket obvykle nemá PSA stupně
                        price: priceUSD,
                        source: 'CardMarket',
                        type: 'Neohodnoceno'
                    });
                }
            });
        });
        
        // Odstraň duplicity
        const uniquePrices = [];
        const seenPrices = new Set();
        
        prices.forEach(price => {
            const priceKey = `${price.grade}_${price.price}`;
            if (!seenPrices.has(priceKey)) {
                seenPrices.add(priceKey);
                uniquePrices.push(price);
            }
        });
        
        console.log('Extracted CardMarket prices:', uniquePrices);
        return uniquePrices;
        
    } catch (error) {
        console.error('Error extracting CardMarket prices:', error);
        return [];
    }
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
