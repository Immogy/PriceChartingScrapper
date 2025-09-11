// Vercel API endpoint pro PriceCharting scraper - OPRAVENÁ VERZE
module.exports.config = { runtime: 'nodejs18.x' };

module.exports = async function handler(req, res) {
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

    let cardVariants = [];
    let source = 'none';

    console.log(`=== SCRAPER STARTED for: ${pokemon} ===`);

    // Zkus nejprve PriceCharting
    let pcOk = false;
    try {
        console.log('Trying PriceCharting first...');
        cardVariants = await scrapePriceCharting(pokemon, grade);
        source = 'PriceCharting';
        pcOk = true;
        console.log(`PriceCharting success: ${cardVariants.length} cards`);
    } catch (e) {
        console.log('PriceCharting failed:', e && e.message ? e.message : e);
    }

    // Pokud PriceCharting selže nebo vrátí prázdno, zkus CardMarket
    if (!pcOk || cardVariants.length === 0) {
        try {
            console.log('Trying CardMarket as fallback...');
            cardVariants = await scrapeCardMarket(pokemon, grade);
            source = 'CardMarket';
            console.log(`CardMarket success: ${cardVariants.length} cards`);
        } catch (e2) {
            console.log('CardMarket failed:', e2 && e2.message ? e2.message : e2);
        }
    }

    // Pokud pořád nic, vrať prázdné, ale 200 (kvůli CORS)
    res.status(200).json({
        success: true,
        pokemon,
        grade: grade || 'all',
        cards: Array.isArray(cardVariants) ? cardVariants : [],
        count: Array.isArray(cardVariants) ? cardVariants.length : 0,
        source
    });
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

function parsePriceChartingHTML(html, pokemonName, grade) {
    try {
        console.log('Parsing PriceCharting HTML for:', pokemonName);
        
        const cardVariants = [];
        
        // Hledej karty v PriceCharting HTML
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
    try {
        console.log('Extracting real prices from HTML...');

        // 1) Najdi všechny labely grade a k nim nejbližší cenu
        //   - páruj label -> $price v krátké vzdálenosti (±150 znaků)
        const labelRegex = /(Ungraded|Unrated|Raw|Grade\s*\d+(?:\.5)?|PSA\s*\d+(?:\.5)?|BGS\s*10\s*Black\s*Label|BGS\s*10\s*Black|BGS\s*\d+(?:\.5)?|SGC\s*\d+(?:\.5)?|CGC\s*10\s*Pristine|CGC\s*Pristine\s*10|CGC\s*\d+(?:\.5)?)/gi;
        const priceRegex = /\$\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/g;

        // Mapuj všechny výskyty: grade -> list cen (v USD cent)
        const gradeToCentsList = new Map();

        let match;
        while ((match = labelRegex.exec(html)) !== null) {
            const rawLabel = match[0];
            const startIdx = match.index;
            const windowStart = Math.max(0, startIdx - 150);
            const windowEnd = Math.min(html.length, startIdx + 300);
            const window = html.slice(windowStart, windowEnd);

            // Najdi první cenu v blízkosti labelu
            priceRegex.lastIndex = 0;
            const priceMatch = priceRegex.exec(window);
            if (!priceMatch) continue;

            const priceUsd = parseFloat(priceMatch[1].replace(/,/g, ''));
            if (!(priceUsd > 0 && priceUsd < 100000)) continue;

            const psaGrade = normalizeToPsaGrade(rawLabel);
            if (!psaGrade) continue;

            const list = gradeToCentsList.get(psaGrade) || [];
            list.push(Math.round(priceUsd * 100));
            gradeToCentsList.set(psaGrade, list);
        }

        // 2) Přepočítej na průměr (fallback na medián pokud by bylo třeba)
        const prices = [];
        gradeToCentsList.forEach((centsList, grade) => {
            if (!centsList.length) return;
            const avg = Math.round(centsList.reduce((a, b) => a + b, 0) / centsList.length);
            prices.push({
                grade,
                price: avg,
                source: 'PriceCharting',
                type: grade === 'PSA0' ? 'Neohodnoceno' : `PSA ${grade.replace('PSA', '')}`
            });
        });

        if (prices.length === 0) {
            console.log('No real prices found from PriceCharting');
            return [];
        }

        // 3) Seřaď podle PSA stupně (10, 9, ... 1, 0)
        prices.sort((a, b) => parseInt(b.grade.slice(3)) - parseInt(a.grade.slice(3)));
        console.log('Extracted real prices:', prices);
        return prices;
    } catch (error) {
        console.error('Error extracting real prices:', error);
        return [];
    }
}

function normalizeToPsaGrade(rawLabel) {
    const label = rawLabel.replace(/\s+/g, ' ').trim().toLowerCase();

    // Ungraded / Raw
    if (/(^|\s)(ungraded|unrated|raw)(\s|$)/.test(label)) return 'PSA0';

    // Grade X / PSA X / SGC X / CGC X / BGS X (Black Label)
    // Preferenčně mapovat 10 na PSA10, 9.5 -> PSA9 (uživatel chce PSA1-10 + PSA0)
    const numMatch = label.match(/(grade|psa|sgc|cgc|bgs)\s*(10|9\.5|[1-9](?:\.5)?)/);
    if (numMatch) {
        const brand = numMatch[1];
        const value = numMatch[2];

        // Speciály
        if (label.includes('bgs 10 black label') || label.includes('bgs 10 black')) return 'PSA10';
        if (label.includes('cgc 10 pristine') || label.includes('pristine 10')) return 'PSA10';

        if (value === '10') return 'PSA10';
        if (value === '9.5') return 'PSA9';
        const n = parseInt(value, 10);
        if (n >= 1 && n <= 9) return `PSA${n}`;
    }

    return null;
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

// CardMarket scraper (funkční fallback)
async function scrapeCardMarket(pokemonName, grade = 'all') {
    console.log('Scraping REAL data from CardMarket for:', pokemonName);
    try {
        const searchUrl = `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${encodeURIComponent(pokemonName)}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(searchUrl, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Connection': 'keep-alive',
                'Referer': 'https://www.cardmarket.com/en/Pokemon',
            }
        });
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error(`CardMarket HTTP ${response.status}`);
        const html = await response.text();
        if (html.length < 1000) throw new Error('CardMarket HTML too short');

        return parseCardMarketHTML(html, pokemonName, grade);
    } catch (error) {
        console.error('CardMarket scraping error:', error);
        return [];
    }
}

function parseCardMarketHTML(html, pokemonName, grade) {
    const results = [];

    // Každý produkt blok – CardMarket často používá "product"/"row" s názvem a cenou "From €X"
    const itemRegex = /<div[^>]*class="[^"]*(?:product|row|article)[^"]*"[\s\S]*?>([\s\S]*?)<\/div>/gi;
    let m;
    let index = 0;
    while ((m = itemRegex.exec(html)) !== null && results.length < 25) {
        const block = m[1];
        if (!new RegExp(pokemonName, 'i').test(block)) continue;

        const nameMatch = block.match(/<a[^>]*>([^<]{3,100})<\/a>/i);
        const name = nameMatch ? nameMatch[1].replace(/<[^>]*>/g, '').trim() : (pokemonName.charAt(0).toUpperCase() + pokemonName.slice(1));

        // Set name (volitelně z breadcrumbu)
        const setMatch = block.match(/<span[^>]*class="[^"]*(?:expansion|set)[^\"]*"[^>]*>([^<]+)<\/span>/i) || block.match(/\(([^)]+)\)/);
        const setName = setMatch ? setMatch[1].replace(/<[^>]*>/g, '').trim() : 'CardMarket';

        // Číslo karty, pokud je uvedeno ve tvaru 4/102 apod.
        const numMatch = block.match(/(\d+)\s*\/\s*\d+/) || block.match(/#\s*(\d+)/);
        const number = numMatch ? numMatch[1] : '?';

        // Obrázek
        let imageUrl = null;
        const imgMatch = block.match(/<img[^>]*src="([^"]*\.(?:jpg|jpeg|png|webp))"/i);
        if (imgMatch && imgMatch[1]) {
            imageUrl = imgMatch[1].startsWith('http') ? imgMatch[1] : `https://www.cardmarket.com${imgMatch[1]}`;
        }

        // Cena "From €X"
        const priceMatch = block.match(/From\s*€\s*([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{1,2})?)/i) || block.match(/€\s*([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{1,2})?)/i);
        let psa0Cents = null;
        if (priceMatch) {
            const eurStr = priceMatch[1].replace(/\./g, '').replace(',', '.');
            const eur = parseFloat(eurStr);
            if (eur > 0 && eur < 100000) {
                // Přibližný převod EUR→USD (bez multiplikátoru, pouze aktuální kurz by byl lepší přes API; zde jednoduché ~1.1)
                const usd = eur * 1.1;
                psa0Cents = Math.round(usd * 100);
            }
        }

        // Fallback obrázku přes Pokémon TCG API, pokud chybí
        results.push({
            id: `cardmarket_${pokemonName.toLowerCase().replace(/\s+/g, '_')}_${index++}`,
            name,
            setName,
            number,
            imageUrl,
            prices: psa0Cents ? [{ grade: 'PSA0', price: psa0Cents, source: 'CardMarket', type: 'Neohodnoceno' }] : [],
            priceHistory: [],
            source: 'CardMarket'
        });
    }

    return results;
}
