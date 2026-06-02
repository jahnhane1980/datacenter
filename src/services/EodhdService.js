import ky from 'ky';

// Unsere statische Makro-Watchlist (wird später im Sync-Skript mit Typ 3 Aktien gemerged)
export const EODHD_STATIC_WATCHLIST = {
    MACRO: ['GSPC.IND', 'TLT.US', 'GLD.US', 'USO.US'],
    CRYPTO: ['BTC-USD.CC']
};

export function createEodhdService(apiKey = process.env.EODHD_API_KEY) {
    if (!apiKey) {
        throw new Error('EODHD_API_KEY ist nicht definiert. Bitte in der .env oder den Github Secrets setzen.');
    }

    const BASE_URL = 'https://eodhd.com/api';

    /**
     * Holt Makro-News anhand von Tags ab und entfernt den 'content'-Block zur Datenschonung.
     * @param {string} tags - Kommagetrennte Tags, z.B. 'macroeconomics,energy'
     * @param {number} limit - Anzahl der Artikel (max 1000)
     * @param {number} offset - Für Pagination beim Backfill
     * @param {string|null} fromDate - Optionales Startdatum (YYYY-MM-DD)
     */
    const fetchNews = async (tags = 'macroeconomics', limit = 50, offset = 0, fromDate = null) => {
        const searchParams = {
            api_token: apiKey,
            t: tags,
            limit: limit,
            offset: offset
        };

        if (fromDate) {
            searchParams.from = fromDate;
        }

        try {
            const response = await ky.get(`${BASE_URL}/news`, { searchParams }).json();
            
            // Speicheroptimierung: Wir mappen das Array und lassen den dicken "content" direkt fallen
            return response.map(article => ({
                date: article.date,
                title: article.title,
                link: article.link,
                tags: article.tags,
                sentiment: article.sentiment
            }));
        } catch (error) {
            console.error(`Fehler beim Abrufen der EODHD News:`, error.message);
            throw error;
        }
    };

    /**
     * Holt die aggregierten Tages-Sentiments für eine Liste von Tickern.
     * @param {Array<string>} tickers - Array von Tickern, z.B. ['GSPC.IND', 'TLT.US']
     * @param {string} fromDate - Startdatum YYYY-MM-DD
     * @param {string|null} toDate - Optionales Enddatum YYYY-MM-DD (Fallback: null für Abwärtskompatibilität)
     */
    const fetchSentiments = async (tickers, fromDate, toDate = null) => {
        // Verbindet das Array zu einem kommagetrennten String für die URL ('s=...')
        const tickerString = tickers.join(',');

        const searchParams = {
            api_token: apiKey,
            s: tickerString,
            from: fromDate
        };

        if (toDate) {
            searchParams.to = toDate;
        }

        try {
            const response = await ky.get(`${BASE_URL}/sentiments`, { searchParams }).json();
            return response;
        } catch (error) {
            console.error(`Fehler beim Abrufen der EODHD Sentiments:`, error.message);
            throw error;
        }
    };

    return {
        fetchNews,
        fetchSentiments
    };
}
