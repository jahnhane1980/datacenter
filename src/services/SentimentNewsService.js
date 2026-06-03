import ky from 'ky';
import Sentiment from 'sentiment';

// Unsere statische Makro-Watchlist
export const SENTIMENT_STATIC_WATCHLIST = {
    MACRO: ['GSPC.IND', 'TLT.US', 'GLD.US', 'USO.US'],
    CRYPTO: ['BTC-USD.CC']
};

export function createSentimentNewsService(apiKey = process.env.FINNHUB_API_KEY) {
    if (!apiKey) {
        throw new Error('FINNHUB_API_KEY ist nicht definiert. Bitte in der .env oder den Github Secrets setzen.');
    }

    const BASE_URL = 'https://finnhub.io/api/v1';
    
    // Initialisiere das lokale Text-Analyse Tool
    const sentimentAnalyzer = new Sentiment();

    /**
     * Holt allgemeine Markt-News anhand einer Kategorie ab und berechnet das Sentiment lokal.
     * Finnhub unterstützt keine 'from/to' Parameter für allgemeine News im Free Tier, 
     * wir holen einfach die aktuellste Charge.
     * @param {string} category - Kategorie, z.B. 'general', 'forex', 'crypto'
     */
    const fetchNews = async (category = 'general') => {
        const searchParams = {
            category: category,
            token: apiKey
        };

        try {
            const response = await ky.get(`${BASE_URL}/news`, { searchParams }).json();
            
            return response.map(article => {
                // Lokale Sentiment-Berechnung aus Headline und Summary
                const textToAnalyze = `${article.headline} ${article.summary}`;
                const analysis = sentimentAnalyzer.analyze(textToAnalyze);
                
                // 'comparative' ist der Score geteilt durch die Anzahl der Wörter.
                // Wir klammern den Wert sicherheitshalber zwischen -1 und 1 ein.
                const polarity = Math.max(-1, Math.min(1, analysis.comparative));

                // UNIX Timestamp (Sekunden) in sauberen ISO-String umwandeln
                const pubDate = new Date(article.datetime * 1000).toISOString();

                return {
                    date: pubDate,
                    title: article.headline,
                    link: article.url,
                    tags: article.category,
                    sentiment: { polarity: polarity } // Struktur beibehalten für den Controller
                };
            });
        } catch (error) {
            console.error(`Fehler beim Abrufen der Finnhub Market News:`, error.message);
            throw error;
        }
    };

    /**
     * Holt die Company News für eine Liste von Tickern, aggregiert sie nach Tagen
     * und berechnet den durchschnittlichen Sentiment-Score pro Tag.
     * @param {Array<string>} tickers - Array von Tickern, z.B. ['GSPC.IND', 'PLTR.US']
     * @param {string} fromDate - Startdatum YYYY-MM-DD
     * @param {string|null} toDate - Optionales Enddatum YYYY-MM-DD
     */
    const fetchSentiments = async (tickers, fromDate, toDate = null) => {
        const results = {};
        const end = toDate || new Date().toISOString().split('T')[0];

        for (const ticker of tickers) {
            // Finnhub mag für US-Aktien keine '.US' Suffixe, also schneiden wir sie für die API ab
            const finnhubTicker = ticker.includes('.US') ? ticker.replace('.US', '') : ticker;

            const searchParams = {
                symbol: finnhubTicker,
                from: fromDate,
                to: end,
                token: apiKey
            };

            try {
                // Bei Finnhub müssen wir im Gegensatz zu EODHD jeden Ticker einzeln abfragen
                const response = await ky.get(`${BASE_URL}/company-news`, { searchParams }).json();
                
                // Aggregation der News nach Tagen (YYYY-MM-DD)
                const dailyAggregates = {};
                
                for (const article of response) {
                    const articleDate = new Date(article.datetime * 1000).toISOString().split('T')[0];
                    const textToAnalyze = `${article.headline} ${article.summary}`;
                    const analysis = sentimentAnalyzer.analyze(textToAnalyze);

                    if (!dailyAggregates[articleDate]) {
                        dailyAggregates[articleDate] = { count: 0, totalComparative: 0 };
                    }
                    dailyAggregates[articleDate].count += 1;
                    dailyAggregates[articleDate].totalComparative += analysis.comparative;
                }

                // Tagesdurchschnitte berechnen und ins Array-Format umwandeln
                const formattedDays = Object.keys(dailyAggregates).map(date => {
                    const dayData = dailyAggregates[date];
                    const avgComparative = dayData.totalComparative / dayData.count;
                    const normalized = Math.max(-1, Math.min(1, avgComparative));

                    return {
                        date: date,
                        count: dayData.count,
                        normalized: normalized
                    };
                });

                // Das Ergebnis unter dem ursprünglichen Datenbank-Namen (inkl. Suffix) speichern
                results[ticker] = formattedDays;

            } catch (error) {
                // Wir werfen den Fehler absichtlich weiter, damit der Controller (Phase 3)
                // entscheiden kann, ob das gesamte Skript abbricht oder nur dieser Ticker übersprungen wird.
                throw new Error(`Finnhub Fehler für ${ticker}: ${error.message}`);
            }
        }

        return results;
    };

    return {
        fetchNews,
        fetchSentiments
    };
}