import { supabaseClient } from '../core/SupabaseClient.js';

const DB_TABLE_SENTIMENT = 'market_sentiment_daily';
const DB_TABLE_NEWS_FEED = 'macro_news_feed';
const DB_TABLE_SYNC_QUEUE = 'eodhd_sync_queue';

export function createSentimentNewsRepository() {
    
    /**
     * Schreibt einen täglichen Sentiment-Score in die Datenbank.
     * @param {string} observationDate - Datum (YYYY-MM-DD)
     * @param {string} ticker - Ticker-Symbol (z.B. TLT.US)
     * @param {number} articleCount - Anzahl der ausgewerteten Artikel
     * @param {number} normalizedScore - Sentiment-Score (-1 bis 1)
     */
    const upsertDailySentiment = async (observationDate, ticker, articleCount, normalizedScore) => {
        const { error } = await supabaseClient
            .from(DB_TABLE_SENTIMENT)
            .upsert(
                { 
                    observation_date: observationDate,
                    ticker: ticker,
                    article_count: articleCount,
                    normalized_score: normalizedScore
                }, 
                { onConflict: 'observation_date, ticker' } // Composite Key sorgt für saubere Updates
            );

        if (error) {
            throw new Error(`Fehler beim Upsert in market_sentiment_daily (${ticker} am ${observationDate}): ${error.message}`);
        }
    };

    /**
     * Speichert einen neuen News-Artikel. Nutzt den Link als Primary Key zum Schutz vor Duplikaten.
     */
    const upsertNewsArticle = async (articleLink, publishedAt, title, tags, sentimentPolarity) => {
        const { error } = await supabaseClient
            .from(DB_TABLE_NEWS_FEED)
            .upsert(
                { 
                    article_link: articleLink,
                    published_at: publishedAt,
                    title: title,
                    tags: tags,
                    sentiment_polarity: sentimentPolarity
                }, 
                { onConflict: 'article_link' }
            );

        if (error) {
            throw new Error(`Fehler beim Upsert in macro_news_feed (${title}): ${error.message}`);
        }
    };

    /**
     * Delta-Helper: Holt das Datum des jüngsten Sentiment-Eintrags.
     */
    const getLatestSentimentDate = async () => {
        const { data, error } = await supabaseClient
            .from(DB_TABLE_SENTIMENT)
            .select('observation_date')
            .order('observation_date', { ascending: false })
            .limit(1);

        if (error) throw new Error(`Fehler beim Abrufen des Sentiment-Datums: ${error.message}`);
        return data && data.length > 0 ? data[0].observation_date : null;
    };

    /**
     * Delta-Helper: Holt das Datum des jüngsten News-Artikels.
     */
    const getLatestNewsDate = async () => {
        const { data, error } = await supabaseClient
            .from(DB_TABLE_NEWS_FEED)
            .select('published_at')
            .order('published_at', { ascending: false })
            .limit(1);

        if (error) throw new Error(`Fehler beim Abrufen des News-Datums: ${error.message}`);
        // Extrahiert nur das Datum (YYYY-MM-DD) aus dem Timestamp
        return data && data.length > 0 ? data[0].published_at.split('T')[0] : null;
    };

    /**
     * Holt die vollständige Sync-Queue aus der Datenbank.
     */
    const getSyncQueue = async () => {
        const { data, error } = await supabaseClient
            .from(DB_TABLE_SYNC_QUEUE)
            .select('*')
            .order('last_sync_at', { ascending: true, nullsFirst: true });

        if (error) throw new Error(`Fehler beim Abrufen der Sync-Queue: ${error.message}`);
        return data || [];
    };

    /**
     * Aktualisiert den last_sync_at Timestamp für eine Liste von Tickern (Upsert).
     * @param {Array<string>} tickers - Array von Ticker-Symbolen
     */
    const updateSyncQueueTimestamps = async (tickers) => {
        if (!tickers || tickers.length === 0) return;

        const now = new Date().toISOString();
        
        // Supabase erlaubt Bulk-Upserts, indem man ein Array von Objekten übergibt
        const upsertData = tickers.map(ticker => ({
            ticker: ticker,
            last_sync_at: now
        }));

        const { error } = await supabaseClient
            .from(DB_TABLE_SYNC_QUEUE)
            .upsert(upsertData, { onConflict: 'ticker' });

        if (error) {
            throw new Error(`Fehler beim Aktualisieren der Sync-Queue: ${error.message}`);
        }
    };

    /**
     * Ermittelt exakte Datenlücken für einen Ticker (RPC Aufruf).
     * @param {string} ticker - Das Ticker-Symbol
     * @param {string} startDate - Startdatum YYYY-MM-DD
     * @param {boolean} excludeWeekends - True für Aktien, False für Krypto
     * @returns {Promise<Array<string>>} Array von fehlenden Daten (YYYY-MM-DD)
     */
    const getMissingSentimentDates = async (ticker, startDate, excludeWeekends) => {
        const { data, error } = await supabaseClient.rpc('get_missing_sentiment_dates', {
            target_ticker: ticker,
            start_date: startDate,
            exclude_weekends: excludeWeekends
        });

        if (error) {
            throw new Error(`Fehler beim Abrufen der Lücken für ${ticker}: ${error.message}`);
        }

        // Mappt das Rückgabe-Objekt der DB zu einem sauberen String-Array
        return data ? data.map(row => row.missing_date) : [];
    };

    return {
        upsertDailySentiment,
        upsertNewsArticle,
        getLatestSentimentDate,
        getLatestNewsDate,
        getSyncQueue,
        updateSyncQueueTimestamps,
        getMissingSentimentDates
    };
}