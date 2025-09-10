# Pokémon PSA Collector s PriceCharting Scraper

## 🎯 **Přehled**

Aplikace pro sledování cen Pokémon karet s integrovaným scraperem pro PriceCharting.com. Aplikace kombinuje data z Pokémon TCG API s reálnými cenami z PriceCharting.

## 🚀 **Funkce**

- **Vyhledávání karet**: Pokémon TCG API
- **Reálné PSA ceny**: PriceCharting scraper
- **Sbírka karet**: Lokální ukládání
- **Cenové grafy**: Chart.js
- **Responzivní design**: Mobile-friendly

## 📁 **Struktura projektu**

```
├── pokemon-psa-collector.html    # Hlavní aplikace
├── api/
│   └── pricecharting.js         # Vercel API endpoint
├── vercel.json                  # Vercel konfigurace
├── package.json                 # Dependencies
└── README.md                    # Dokumentace
```

## 🛠️ **Instalace a nasazení**

### 1. **Lokální vývoj**

```bash
# Instalace dependencies
npm install

# Lokální vývoj
npm run dev
```

### 2. **Nasazení na Vercel**

```bash
# Instalace Vercel CLI
npm i -g vercel

# Přihlášení
vercel login

# Nasazení
vercel --prod
```

### 3. **Konfigurace aplikace**

Po nasazení na Vercel:

1. Zkopírujte URL vašeho Vercel projektu
2. Otevřete `pokemon-psa-collector.html`
3. Najděte řádek 893:
   ```javascript
   const SCRAPER_API_BASE = 'https://YOUR_VERCEL_URL.vercel.app/api';
   ```
4. Nahraďte `YOUR_VERCEL_URL` skutečnou URL

## 🔧 **Jak to funguje**

### **PriceCharting Scraper**

1. **API Endpoint**: `/api/pricecharting`
2. **Parametry**: `?pokemon=charizard&grade=PSA10`
3. **Scraping**: Regex patterns pro PSA grades
4. **Fallback**: TCGPlayer ceny pokud scraper selže

### **Cenový systém**

1. **Priorita 1**: PriceCharting PSA ceny
2. **Priorita 2**: TCGPlayer market ceny
3. **Priorita 3**: Mock ceny na základě rarity

## 📊 **API Endpoint**

### **GET /api/pricecharting**

**Parametry:**
- `pokemon` (required): Název Pokémon karty
- `grade` (optional): PSA grade (PSA10, PSA9, atd.)

**Příklad:**
```bash
GET /api/pricecharting?pokemon=charizard&grade=PSA10
```

**Odpověď:**
```json
{
  "success": true,
  "pokemon": "charizard",
  "grade": "PSA10",
  "prices": [
    {
      "grade": "PSA10",
      "price": 150.00,
      "source": "PriceCharting",
      "type": "PSA 10"
    }
  ]
}
```

## ⚠️ **Důležité upozornění**

### **Legální aspekty**
- **Terms of Service**: Respektujte ToS PriceCharting
- **Rate Limiting**: Nepřetěžujte server
- **CORS**: API je nakonfigurováno pro cross-origin

### **Omezení**
- **Vercel timeout**: 30 sekund max
- **Rate limiting**: Doporučeno max 100 req/min
- **Caching**: 5-10 minut cache

## 🎮 **Použití**

1. **Otevřete** `pokemon-psa-collector.html`
2. **Vyhledejte** Pokémon kartu
3. **Zobrazí se** reálné PSA ceny z PriceCharting
4. **Přidejte** kartu do sbírky
5. **Sledujte** cenové grafy

## 🔍 **Debug**

### **Console logy**
- `Card data for pricing`: Data karty
- `PriceCharting prices found`: Nalezené ceny
- `Using PriceCharting prices`: Použité ceny
- `PriceCharting failed`: Fallback na TCGPlayer

### **Testování API**
```bash
curl "https://YOUR_VERCEL_URL.vercel.app/api/pricecharting?pokemon=pikachu"
```

## 📈 **Výkonnost**

- **Rychlé načítání**: 50 karet okamžitě
- **Background loading**: Další karty v pozadí
- **Cache systém**: 5-10 minut cache
- **Progresivní načítání**: 50 → 100 → 150 → 200 → 250

## 🛡️ **Bezpečnost**

- **CORS headers**: Nakonfigurováno
- **Error handling**: Graceful fallback
- **Rate limiting**: Vercel ochrana
- **User-Agent**: Legitimní browser headers

## 📝 **Changelog**

### **v1.0.0**
- ✅ PriceCharting scraper
- ✅ Vercel API integration
- ✅ Hybrid pricing system
- ✅ Async price loading
- ✅ Background price updates

## 🤝 **Přispívání**

1. Fork repository
2. Vytvořte feature branch
3. Commit změny
4. Push do branch
5. Otevřete Pull Request

## 📄 **Licence**

MIT License - viz LICENSE file

## 🆘 **Podpora**

- **Issues**: GitHub Issues
- **Discussions**: GitHub Discussions
- **Email**: [váš email]

---

**Vytvořeno s ❤️ pro Pokémon sběratele**
