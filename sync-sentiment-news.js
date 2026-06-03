import 'dotenv/config';
import { createSentimentNewsService, SENTIMENT_STATIC_WATCHLIST } from './src/services/SentimentNewsService.js';
import { createSentimentNewsRepository } from './src/repositories/SentimentNewsRepository.js';
import { createTickerRepository } from './src/repositories/TickerRepository.js';

async function runDailySync() {
    console.log('Starte täglichen Finnhub Sync (News & Sentiments)...');

    try {
        const sentimentNewsService = createSentimentNewsService();
        const sentimentNewsRepository = createSentimentNewsRepository();
        const tickerRepository = createTickerRepository(); 

        console.log('Lade dynamische Typ-3-Aktien aus der Datenbank...');
        const type3Tickers = await tickerRepository.getAllTickers(3); 
        const dynamicStocks = type3Tickers.map(t => t.name.includes('.') ? t.name : `${t.name}.US`);

        const fullWatchlist = [
            ...SENTIMENT_STATIC_WATCHLIST.MACRO,
            ...SENTIMENT_STATIC_WATCHLIST.CRYPTO,
            ...dynamicStocks
        ];

        // --- ROUND-ROBIN FILTER ---
        console.log('Lade Sync-Queue für Round-Robin-Verfahren...');
        const syncQueue = await sentimentNewsRepository.getSyncQueue();
        
        const queueMap = new Map();
        for (const item of syncQueue) {
            queueMap.set(item.ticker, item.last_sync_at);
        }

        const sortedWatchlist = [...fullWatchlist].sort((a, b) => {
            const timeA = queueMap.get(a) ? new Date(queueMap.get(a)).getTime() : 0;
            const timeB = queueMap.get(b) ? new Date(queueMap.get(b)).getTime() : 0;
            return timeA - timeB;
        });

        // Die Batch Size für Finnhub können wir wieder auf 5 setzen (oder höher), 
        // da das Free-Limit hier bei 60 Requests pro Minute liegt.
        const BATCH_SIZE = 5; 
        const currentBatch = sortedWatchlist.slice(0, BATCH_SIZE);
        console.log(`Round-Robin Batch für heute (${currentBatch.length} Ticker):`, currentBatch);


        // --- 1. SENTIMENT DAILY SYNC ---
        let oldestBatchDate = null;

        for (const ticker of currentBatch) {
            const lastSync = queueMap.get(ticker);
            if (lastSync) {
                const d = new Date(lastSync);
                if (!oldestBatchDate || d < oldestBatchDate) {
                    oldestBatchDate = d;
                }
            } else {
                const fallback = new Date();
                fallback.setDate(fallback.getDate() - 7); 
                if (!oldestBatchDate || fallback < oldestBatchDate) {
                    oldestBatchDate = fallback;
                }
            }
        }

        let sentimentStartDate;
        if (oldestBatchDate) {
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

        const failedTickers = [];
        const successfulTickers = [];
        let sentimentSuccess = 0;
        let sentimentErrors = 0;

        // Wir iterieren den Batch und fangen Fehler pro Ticker ab, damit das Skript stur weiterläuft
        for (const ticker of currentBatch) {
            try {
                const sentimentData = await sentimentNewsService.fetchSentiments([ticker], sentimentStartDate);
                
                const daysArray = sentimentData[ticker] || [];
                for (const dayData of daysArray) {
                    try {
                        await sentimentNewsRepository.upsertDailySentiment(
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
                successfulTickers.push(ticker);
            } catch (err) {
                console.error(`=> Überspringe Ticker ${ticker}: ${err.message}`);
                failedTickers.push(ticker);
            }
        }
        console.log(`Sentiment Sync beendet. Erfolgreiche Upserts: ${sentimentSuccess}, Fehler: ${sentimentErrors}`);

        // --- ROUND-ROBIN QUITTUNG ---
        console.log('Aktualisiere Sync-Queue Timestamps für erfolgreiche Ticker...');
        // Der reparierte Logik-Fehler: Nur die Ticker aktualisieren, die auch funktioniert haben!
        await sentimentNewsRepository.updateSyncQueueTimestamps(successfulTickers);


        // --- 2. NEWS DAILY SYNC ---
        // Finnhubs "general" News Endpunkt ignoriert from/to Datumsbereiche im Free Tier.
        // Er liefert automatisch immer die aktuellste Charge zurück.
        console.log(`Lade aktuelle General News von Finnhub...`);
        
        let newsSuccess = 0;
        let newsErrors = 0;

        try {
            const newsData = await sentimentNewsService.fetchNews('general');
            
            for (const article of newsData) {
                try {
                    const polarity = article.sentiment && article.sentiment.polarity !== undefined 
                        ? article.sentiment.polarity 
                        : null;

                    await sentimentNewsRepository.upsertNewsArticle(
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
        } catch (err) {
            console.error(`=> Fehler beim Abrufen der general News: ${err.message}`);
            failedTickers.push('GENERAL_NEWS');
        }
        console.log(`News Sync beendet. Erfolgreiche Upserts: ${newsSuccess}, Fehler: ${newsErrors}`);

        // --- FEHLER-AUSWERTUNG & GITHUB ACTIONS ALARM ---
        if (failedTickers.length > 0) {
            console.warn(`\nACHTUNG: Der Sync lief durch, aber folgende Ticker/Bereiche konnten nicht verarbeitet werden:`, failedTickers);
            console.warn('Das Skript wird nun mit Fehlercode 1 beendet, um den GitHub-Workflow auf "failed" zu setzen und den Alarm auszulösen.');
            process.exit(1);
        } else {
            console.log('\nGesamter Finnhub Daily Sync erfolgreich abgeschlossen!');
        }

    } catch (error) {
        console.error('Kritischer Fehler im Finnhub Daily-Sync-Skript:', error);
        process.exit(1);
    }
}

runDailySync();