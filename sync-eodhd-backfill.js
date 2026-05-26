import 'dotenv/config';
import { createEodhdService, EODHD_STATIC_WATCHLIST } from './src/services/EodhdService.js';
import { createEodhdRepository } from './src/repositories/EodhdRepository.js';
import { createTickerRepository } from './src/repositories/TickerRepository.js';

async function runBackfill() {
    console.log('Starte EODHD Backfill (News & Sentiments) mit Delta-Prüfung...');

    try {
        const eodhdService = createEodhdService();
        const eodhdRepository = createEodhdRepository();
        const tickerRepository = createTickerRepository();

        console.log('Lade dynamische Typ-3-Aktien aus der Datenbank...');
        const type3Tickers = await tickerRepository.getAllTickers(3);
        const dynamicStocks = type3Tickers.map(t => t.name.includes('.') ? t.name : `${t.name}.US`);

        const fullWatchlist = [
            ...EODHD_STATIC_WATCHLIST.MACRO,
            ...EODHD_STATIC_WATCHLIST.CRYPTO,
            ...dynamicStocks
        ];

        console.log(`Watchlist für Sentiment-API zusammengebaut: ${fullWatchlist.length} Ticker.`);

        // --- 1. SENTIMENT BACKFILL (MIT DELTA) ---
        const latestSentimentDate = await eodhdRepository.getLatestSentimentDate();
        const sentimentStartDate = latestSentimentDate ? latestSentimentDate : '2025-05-01';
        
        console.log(`Lade historische Sentiments ab ${sentimentStartDate}...`);
        const sentimentData = await eodhdService.fetchSentiments(fullWatchlist, sentimentStartDate);
        
        let sentimentSuccess = 0;
        let sentimentErrors = 0;

        for (const [ticker, daysArray] of Object.entries(sentimentData)) {
            const dayDataArray = Array.isArray(daysArray) ? daysArray : [];
            for (const dayData of dayDataArray) {
                try {
                    await eodhdRepository.upsertDailySentiment(
                        dayData.date,
                        ticker,
                        dayData.count,
                        dayData.normalized
                    );
                    sentimentSuccess++;
                } catch (err) {
                    sentimentErrors++;
                }
            }
        }
        console.log(`Sentiment Backfill beendet. Erfolgreich: ${sentimentSuccess}, Fehler: ${sentimentErrors}`);

        // --- 2. NEWS BACKFILL (MIT DELTA) ---
        const latestNewsDate = await eodhdRepository.getLatestNewsDate();
        const newsStartDate = latestNewsDate ? latestNewsDate : '2025-05-01';

        console.log(`Lade historische News ab ${newsStartDate} (Limit: 50, Tag: macroeconomics)...`);
        const newsData = await eodhdService.fetchNews('macroeconomics', 50, 0, newsStartDate);
        
        let newsSuccess = 0;
        let newsErrors = 0;

        for (const article of newsData) {
            try {
                const polarity = article.sentiment && article.sentiment.polarity !== undefined 
                    ? article.sentiment.polarity 
                    : null;

                await eodhdRepository.upsertNewsArticle(
                    article.link,
                    article.date, 
                    article.title,
                    article.tags,
                    polarity
                );
                newsSuccess++;
            } catch (err) {
                console.error(`Fehler beim News-Upsert für ${article.title}:`, err.message);
                newsErrors++;
            }
        }
        console.log(`News Backfill beendet. Erfolgreich: ${newsSuccess}, Fehler: ${newsErrors}`);
        console.log('Gesamter EODHD Backfill erfolgreich abgeschlossen!');

    } catch (error) {
        console.error('Kritischer Fehler im EODHD Backfill-Skript:', error);
        process.exit(1);
    }
}

runBackfill();