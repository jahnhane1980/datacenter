
import { SENTIMENT_STATIC_WATCHLIST } from '../services/SentimentNewsService.js';
import { SYNC_JOBS } from '../repositories/TickerRepository.js';

export class SentimentNewsController {
    /**
     * @param {Object} tickerRepo 
     * @param {Object} sentimentNewsRepo 
     * @param {Object} sentimentNewsService 
     * @param {Object} pacingManager
     */
    constructor(tickerRepo, sentimentNewsRepo, sentimentNewsService, pacingManager) {
        this.tickerRepo = tickerRepo;
        this.sentimentNewsRepo = sentimentNewsRepo;
        this.sentimentNewsService = sentimentNewsService;
        this.pacingManager = pacingManager;
    }

    /**
     * Daily Sync für Sentiments und News
     */
    async runDailySync() {
        console.log('Starte täglichen Finnhub Sync (News & Sentiments)...');

        console.log('Lade dynamische Ticker für SENTIMENT aus der Datenbank...');
        const type3Tickers = await this.tickerRepo.getTickersForJob(SYNC_JOBS.SENTIMENT); 
        const dynamicStocks = type3Tickers.map(t => t.name.includes('.') ? t.name : `${t.name}.US`);

        const fullWatchlist = [
            ...SENTIMENT_STATIC_WATCHLIST.MACRO,
            ...SENTIMENT_STATIC_WATCHLIST.CRYPTO,
            ...dynamicStocks
        ];

        console.log('Lade Sync-Queue für Round-Robin-Verfahren...');
        const syncQueue = await this.sentimentNewsRepo.getSyncQueue();
        
        const queueMap = new Map();
        for (const item of syncQueue) {
            queueMap.set(item.ticker, item.last_sync_at);
        }

        const sortedWatchlist = [...fullWatchlist].sort((a, b) => {
            const timeA = queueMap.get(a) ? new Date(queueMap.get(a)).getTime() : 0;
            const timeB = queueMap.get(b) ? new Date(queueMap.get(b)).getTime() : 0;
            return timeA - timeB;
        });

        const BATCH_SIZE = 5; 
        const currentBatch = sortedWatchlist.slice(0, BATCH_SIZE);
        console.log(`Round-Robin Batch für heute (${currentBatch.length} Ticker):`, currentBatch);

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

        for (const ticker of currentBatch) {
            try {
                const sentimentData = await this.sentimentNewsService.fetchSentiments([ticker], sentimentStartDate);
                
                const daysArray = sentimentData[ticker] || [];
                for (const dayData of daysArray) {
                    try {
                        await this.sentimentNewsRepo.upsertDailySentiment(
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

        console.log('Aktualisiere Sync-Queue Timestamps für erfolgreiche Ticker...');
        await this.sentimentNewsRepo.updateSyncQueueTimestamps(successfulTickers);

        console.log(`Lade aktuelle General News von Finnhub...`);
        let newsSuccess = 0;
        let newsErrors = 0;

        try {
            const newsData = await this.sentimentNewsService.fetchNews('general');
            
            for (const article of newsData) {
                try {
                    const polarity = article.sentiment && article.sentiment.polarity !== undefined 
                        ? article.sentiment.polarity 
                        : null;

                    await this.sentimentNewsRepo.upsertNewsArticle(
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

        if (failedTickers.length > 0) {
            console.warn(`\nACHTUNG: Der Sync lief durch, aber folgende Ticker/Bereiche konnten nicht verarbeitet werden:`, failedTickers);
            throw new Error('Sync abgeschlossen mit Fehlern');
        } else {
            console.log('\nGesamter Finnhub Daily Sync erfolgreich abgeschlossen!');
        }
    }

    /**
     * Backfill Logik
     */
    async runBackfill() {
        console.log('Starte Finnhub Backfill (Sentiments) als chirurgischen Lücken-Stopfer...');

        const BACKFILL_TARGET_DATE = '2025-05-01';

        console.log('Lade dynamische Ticker für SENTIMENT aus der Datenbank...');
        const type3Tickers = await this.tickerRepo.getTickersForJob(SYNC_JOBS.SENTIMENT);
        const dynamicStocks = type3Tickers.map(t => t.name.includes('.') ? t.name : `${t.name}.US`);

        const fullWatchlist = [
            ...SENTIMENT_STATIC_WATCHLIST.MACRO,
            ...SENTIMENT_STATIC_WATCHLIST.CRYPTO,
            ...dynamicStocks
        ];

        console.log(`Watchlist bereit: ${fullWatchlist.length} Ticker. Starte Einzelprüfung mit 1.5s Rate-Limit-Bremse...`);

        let rateLimitReached = false;

        for (const ticker of fullWatchlist) {
            if (rateLimitReached) break; 

            const isCrypto = SENTIMENT_STATIC_WATCHLIST.CRYPTO.includes(ticker) || ticker.includes('BTC');
            
            const validMissingDates = await this.sentimentNewsRepo.getMissingSentimentDates(ticker, BACKFILL_TARGET_DATE, !isCrypto);

            if (validMissingDates.length === 0) {
                console.log(`[${ticker}] Keine Lücken bis ${BACKFILL_TARGET_DATE} gefunden. Komplett!`);
                continue; 
            }

            const fromDate = validMissingDates[0];
            const toDate = validMissingDates[validMissingDates.length - 1];

            console.log(`[${ticker}] ${validMissingDates.length} fehlende Tage identifiziert. Lade Lücken-Block (${fromDate} bis ${toDate})...`);

            try {
                const sentimentData = await this.sentimentNewsService.fetchSentiments([ticker], fromDate, toDate);
                
                let sentimentSuccess = 0;
                let sentimentErrors = 0;

                const daysArray = sentimentData[ticker] || [];
                for (const dayData of daysArray) {
                    try {
                        await this.sentimentNewsRepo.upsertDailySentiment(
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
                console.log(`[${ticker}] Upserts erfolgreich: ${sentimentSuccess}, Fehler: ${sentimentErrors}`);

                if (this.pacingManager) await this.pacingManager.sleepMs(1500);

            } catch (error) {
                if (error.response && (error.response.status === 429 || error.response.status === 402)) {
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    console.warn(`\n[!] Rate Limit für heute erschöpft. Bitte erst wieder am ${tomorrow.toISOString().split('T')[0]} ausführen.`);
                    rateLimitReached = true; 
                    break; 
                } else {
                    console.error(`Fehler beim API-Abruf für ${ticker}:`, error.message);
                    if (this.pacingManager) await this.pacingManager.sleepMs(1500);
                }
            }
        }

        if (!rateLimitReached) {
            console.log(`\nLade General News (Achtung: Finnhub liefert hier nur aktuellste Daten, kein echtes Backfill möglich)...`);
            
            try {
                const newsData = await this.sentimentNewsService.fetchNews('general');
                
                let newsSuccess = 0;
                let newsErrors = 0;

                for (const article of newsData) {
                    try {
                        const polarity = article.sentiment && article.sentiment.polarity !== undefined 
                            ? article.sentiment.polarity 
                            : null;

                        await this.sentimentNewsRepo.upsertNewsArticle(
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
                console.log(`News Durchlauf beendet. Erfolgreich: ${newsSuccess}, Fehler: ${newsErrors}`);
            } catch (error) {
                if (error.response && (error.response.status === 429 || error.response.status === 402)) {
                    console.warn(`[!] Rate Limit für News erschöpft.`);
                } else {
                    console.error(`Fehler beim News-Abruf:`, error.message);
                }
            }
        }

        console.log('\nGesamter Finnhub Backfill-Durchlauf beendet!');
    }
}
