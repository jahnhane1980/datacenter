import 'dotenv/config';
import Holidays from 'date-holidays';
import { createEodhdService, EODHD_STATIC_WATCHLIST } from './src/services/EodhdService.js';
import { createEodhdRepository } from './src/repositories/EodhdRepository.js';
import { createTickerRepository } from './src/repositories/TickerRepository.js';

async function runBackfill() {
    console.log('Starte EODHD Backfill (News & Sentiments) als chirurgischen Lücken-Stopfer...');

    // Feiertags-Kalender für die USA initialisieren
    const holidays = new Holidays('US');
    const BACKFILL_TARGET_DATE = '2025-05-01';

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

        console.log(`Watchlist bereit: ${fullWatchlist.length} Ticker. Starte Einzelprüfung...`);

        // --- 1. SENTIMENT BACKFILL (CHIRURGISCH) ---
        let rateLimitReached = false;

        for (const ticker of fullWatchlist) {
            if (rateLimitReached) break; // Stoppt weitere Ticker, falls Limit voll

            const isCrypto = EODHD_STATIC_WATCHLIST.CRYPTO.includes(ticker) || ticker.includes('BTC');
            
            // Holt grobe Lücken (Wochenenden bei Nicht-Krypto bereits rausgefiltert)
            const rawMissingDates = await eodhdRepository.getMissingSentimentDates(ticker, BACKFILL_TARGET_DATE, !isCrypto);

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
                const sentimentData = await eodhdService.fetchSentiments([ticker], fromDate, toDate);
                
                let sentimentSuccess = 0;
                let sentimentErrors = 0;

                for (const [resTicker, daysArray] of Object.entries(sentimentData)) {
                    const dayDataArray = Array.isArray(daysArray) ? daysArray : [];
                    for (const dayData of dayDataArray) {
                        try {
                            await eodhdRepository.upsertDailySentiment(
                                dayData.date,
                                resTicker,
                                dayData.count,
                                dayData.normalized
                            );
                            sentimentSuccess++;
                        } catch (err) {
                            sentimentErrors++;
                        }
                    }
                }
                console.log(`[${ticker}] Upserts erfolgreich: ${sentimentSuccess}, Fehler: ${sentimentErrors}`);

            } catch (error) {
                // Graceful Exit bei Limit-Ausschöpfung (Status 402)
                if (error.response && error.response.status === 402) {
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    console.warn(`\n[!] Rate Limit für heute erschöpft. Bitte erst wieder am ${tomorrow.toISOString().split('T')[0]} ausführen.`);
                    rateLimitReached = true; 
                    break; 
                } else {
                    console.error(`Fehler beim API-Abruf für ${ticker}:`, error.message);
                }
            }
        }

        // --- 2. NEWS BACKFILL (MIT GRACEFUL EXIT) ---
        if (!rateLimitReached) {
            const latestNewsDate = await eodhdRepository.getLatestNewsDate();
            const newsStartDate = latestNewsDate ? latestNewsDate : BACKFILL_TARGET_DATE;

            console.log(`\nLade historische News ab ${newsStartDate} (Limit: 50, Tag: macroeconomics)...`);
            
            try {
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
                console.log(`News Backfill beendet. Erfolgreich: ${newsSuccess}, Fehler: ${newsErrors}`);
            } catch (error) {
                if (error.response && error.response.status === 402) {
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    console.warn(`[!] Rate Limit für News erschöpft. Bitte erst wieder am ${tomorrow.toISOString().split('T')[0]} ausführen.`);
                } else {
                    console.error(`Fehler beim News-Abruf:`, error.message);
                }
            }
        }

        console.log('\nGesamter EODHD Backfill-Durchlauf beendet!');

    } catch (error) {
        console.error('Kritischer Fehler im EODHD Backfill-Skript:', error);
        process.exit(1);
    }
}

runBackfill();