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

        // --- ROUND-ROBIN FILTER ---
        console.log('Lade Sync-Queue für Round-Robin-Verfahren...');
        const syncQueue = await eodhdRepository.getSyncQueue();
        
        // Map aufbauen für schnellen Timestamp-Zugriff beim Sortieren
        const queueMap = new Map();
        for (const item of syncQueue) {
            queueMap.set(item.ticker, item.last_sync_at);
        }

        // Ticker sortieren: Älteste Timestamps (oder 0, falls noch nie gesynct) nach oben
        const sortedWatchlist = [...fullWatchlist].sort((a, b) => {
            const timeA = queueMap.get(a) ? new Date(queueMap.get(a)).getTime() : 0;
            const timeB = queueMap.get(b) ? new Date(queueMap.get(b)).getTime() : 0;
            return timeA - timeB;
        });

        // Batch-Limit setzen, um die API zu schonen. Kann bei Bedarf angepasst werden.
        const BATCH_SIZE = 5; 
        const currentBatch = sortedWatchlist.slice(0, BATCH_SIZE);
        console.log(`Round-Robin Batch für heute (${currentBatch.length} Ticker):`, currentBatch);


        // --- 1. SENTIMENT DAILY SYNC ---
        // Bestimme das älteste Datum exakt innerhalb des aktuellen Batches
        let oldestBatchDate = null;

        for (const ticker of currentBatch) {
            const lastSync = queueMap.get(ticker);
            if (lastSync) {
                const d = new Date(lastSync);
                if (!oldestBatchDate || d < oldestBatchDate) {
                    oldestBatchDate = d;
                }
            } else {
                // Fallback: Wenn ein Ticker noch nie in der Queue war, 7 Tage zurückgehen
                const fallback = new Date();
                fallback.setDate(fallback.getDate() - 7); // FEHLER BEHOBEN
                if (!oldestBatchDate || fallback < oldestBatchDate) {
                    oldestBatchDate = fallback;
                }
            }
        }

        let sentimentStartDate;
        if (oldestBatchDate) {
            // Buffer: Gehe 2 Tage vom ältesten Eintrag des Batches zurück, um nachträgliche Updates aufzufangen
            const d = new Date(oldestBatchDate);
            d.setDate(d.getDate() - 2);
            sentimentStartDate = d.toISOString().split('T')[0];
            console.log(`Ältestes Datum im aktuellen Batch: ${oldestBatchDate.toISOString().split('T')[0]}. Hole Delta ab ${sentimentStartDate}...`);
        } else {
            const fallbackDate = new Date();
            fallbackDate.setDate(fallbackDate.getDate() - 7);
            sentimentStartDate = fallbackDate.toISOString().split('T')[0];
            console.log(`Kein Datum für Batch bestimmbar. Fallback auf ${sentimentStartDate}...`);
        }

        // Wir nutzen hier nur noch den currentBatch für die Abfrage
        const sentimentData = await eodhdService.fetchSentiments(currentBatch, sentimentStartDate);
        
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

        // --- ROUND-ROBIN QUITTUNG ---
        console.log('Aktualisiere Sync-Queue Timestamps für den heutigen Batch...');
        await eodhdRepository.updateSyncQueueTimestamps(currentBatch);


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
