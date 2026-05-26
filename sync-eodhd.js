import 'dotenv/config';
import { createEodhdService, EODHD_STATIC_WATCHLIST } from './src/services/EodhdService.js';
import { createEodhdRepository } from './src/repositories/EodhdRepository.js';
import { createTickerRepository } from './src/repositories/TickerRepository.js';

async function runDailySync() {
    console.log('Starte täglichen EODHD Sync (News & Sentiments)...');

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

        // --- 1. SENTIMENT DAILY SYNC ---
        const latestSentimentDate = await eodhdRepository.getLatestSentimentDate();
        let sentimentStartDate;

        if (latestSentimentDate) {
            // Buffer: Gehe 2 Tage vom letzten Eintrag zurück, um nachträgliche Updates aufzufangen
            const d = new Date(latestSentimentDate);
            d.setDate(d.getDate() - 2);
            sentimentStartDate = d.toISOString().split('T')[0];
            console.log(`Letztes Sentiment: ${latestSentimentDate}. Hole Delta ab ${sentimentStartDate}...`);
        } else {
            const fallbackDate = new Date();
            fallbackDate.setDate(fallbackDate.getDate() - 7);
            sentimentStartDate = fallbackDate.toISOString().split('T')[0];
            console.log(`Kein letztes Sentiment gefunden. Fallback auf ${sentimentStartDate}...`);
        }

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
        console.log(`Sentiment Sync beendet. Erfolgreiche Upserts: ${sentimentSuccess}, Fehler: ${sentimentErrors}`);

        // --- 2. NEWS DAILY SYNC ---
        const latestNewsDate = await eodhdRepository.getLatestNewsDate();
        let newsStartDate = null;

        if (latestNewsDate) {
            // Buffer: Gehe 2 Tage zurück
            const d = new Date(latestNewsDate);
            d.setDate(d.getDate() - 2);
            newsStartDate = d.toISOString().split('T')[0];
            console.log(`Letzte News: ${latestNewsDate}. Hole Delta ab ${newsStartDate}...`);
        } else {
            const fallbackDate = new Date();
            fallbackDate.setDate(fallbackDate.getDate() - 7);
            newsStartDate = fallbackDate.toISOString().split('T')[0];
            console.log(`Keine letzten News gefunden. Fallback auf ${newsStartDate}...`);
        }

        console.log(`Lade aktuelle News (Limit: 50, Tag: macroeconomics)...`);
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
                newsErrors++;
            }
        }
        console.log(`News Sync beendet. Erfolgreiche Upserts: ${newsSuccess}, Fehler: ${newsErrors}`);
        console.log('Gesamter EODHD Daily Sync erfolgreich abgeschlossen!');

    } catch (error) {
        console.error('Kritischer Fehler im EODHD Daily-Sync-Skript:', error);
        process.exit(1);
    }
}

runDailySync();