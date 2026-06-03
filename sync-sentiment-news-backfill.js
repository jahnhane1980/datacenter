import 'dotenv/config';
import Holidays from 'date-holidays';
import { createSentimentNewsService, SENTIMENT_STATIC_WATCHLIST } from './src/services/SentimentNewsService.js';
import { createSentimentNewsRepository } from './src/repositories/SentimentNewsRepository.js';
import { createTickerRepository } from './src/repositories/TickerRepository.js';

// Hilfsfunktion für den präventiven Delay
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function runBackfill() {
    console.log('Starte Finnhub Backfill (Sentiments) als chirurgischen Lücken-Stopfer...');

    // Feiertags-Kalender für die USA initialisieren
    const holidays = new Holidays('US');
    const BACKFILL_TARGET_DATE = '2025-05-01';

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

        console.log(`Watchlist bereit: ${fullWatchlist.length} Ticker. Starte Einzelprüfung mit 1.5s Rate-Limit-Bremse...`);

        // --- 1. SENTIMENT BACKFILL (CHIRURGISCH) ---
        let rateLimitReached = false;

        for (const ticker of fullWatchlist) {
            if (rateLimitReached) break; // Stoppt weitere Ticker, falls Limit voll

            const isCrypto = SENTIMENT_STATIC_WATCHLIST.CRYPTO.includes(ticker) || ticker.includes('BTC');
            
            // Holt grobe Lücken (Wochenenden bei Nicht-Krypto bereits rausgefiltert)
            const rawMissingDates = await sentimentNewsRepository.getMissingSentimentDates(ticker, BACKFILL_TARGET_DATE, !isCrypto);

            // Feinfilter: Feiertage bei Nicht-Krypto entfernen
            const validMissingDates = rawMissingDates.filter(dateStr => {
                if (isCrypto) return true; // Krypto kennt keine Feiertage
                
                const d = new Date(dateStr);
                const holidayList = holidays.isHoliday(d);
                // Filtere offizielle Feiertage (public) und Bankfeiertage (bank)
                if (holidayList && holidayList.some(h => h.type === 'public' || h.type === 'bank')) {
                    return false;
                }
                return true;
            });

            if (validMissingDates.length === 0) {
                console.log(`[${ticker}] Keine Lücken bis ${BACKFILL_TARGET_DATE} gefunden. Komplett!`);
                continue; // Nächster Ticker
            }

            // Wir nehmen den Zeitraum der Lücken (vom ältesten bis zum neuesten fehlenden Tag)
            const fromDate = validMissingDates[0];
            const toDate = validMissingDates[validMissingDates.length - 1];

            console.log(`[${ticker}] ${validMissingDates.length} fehlende Tage identifiziert. Lade Lücken-Block (${fromDate} bis ${toDate})...`);

            try {
                const sentimentData = await sentimentNewsService.fetchSentiments([ticker], fromDate, toDate);
                
                let sentimentSuccess = 0;
                let sentimentErrors = 0;

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
                console.log(`[${ticker}] Upserts erfolgreich: ${sentimentSuccess}, Fehler: ${sentimentErrors}`);

                // Präventive Bremse, um unter 60 Requests pro Minute zu bleiben
                await delay(1500);

            } catch (error) {
                // Graceful Exit bei Limit-Ausschöpfung (Finnhub nutzt oft 429 Too Many Requests)
                if (error.response && (error.response.status === 429 || error.response.status === 402)) {
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    console.warn(`\n[!] Rate Limit für heute erschöpft. Bitte erst wieder am ${tomorrow.toISOString().split('T')[0]} ausführen.`);
                    rateLimitReached = true; 
                    break; 
                } else {
                    console.error(`Fehler beim API-Abruf für ${ticker}:`, error.message);
                    // Nach einem Fehler auch kurz pausieren, bevor der nächste Ticker angefragt wird
                    await delay(1500);
                }
            }
        }

        // --- 2. NEWS BACKFILL (MIT GRACEFUL EXIT) ---
        // DESIGN-HINWEIS: Finnhub General News unterstützt historisches Backfilling nicht.
        // Dieser Block ruft lediglich die aktuellsten News ab.
        if (!rateLimitReached) {
            console.log(`\nLade General News (Achtung: Finnhub liefert hier nur aktuellste Daten, kein echtes Backfill möglich)...`);
            
            try {
                const newsData = await sentimentNewsService.fetchNews('general');
                
                let newsSuccess = 0;
                let newsErrors = 0;

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

    } catch (error) {
        console.error('Kritischer Fehler im Finnhub Backfill-Skript:', error);
        process.exit(1);
    }
}

runBackfill();