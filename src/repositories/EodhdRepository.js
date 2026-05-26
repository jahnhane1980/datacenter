import { supabaseClient } from '../core/SupabaseClient.js';

export function createEodhdRepository() {
    
    /**
     * Schreibt einen täglichen Sentiment-Score in die Datenbank.
     * @param {string} observationDate - Datum (YYYY-MM-DD)
     * @param {string} ticker - Ticker-Symbol (z.B. TLT.US)
     * @param {number} articleCount - Anzahl der ausgewerteten Artikel
     * @param {number} normalizedScore - Sentiment-Score (-1 bis 1)
     */
    const upsertDailySentiment = async (observationDate, ticker, articleCount, normalizedScore) => {
        const { error } = await supabaseClient
            .from('market_sentiment_daily')
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
            .from('macro_news_feed')
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
            .from('market_sentiment_daily')
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
            .from('macro_news_feed')
            .select('published_at')
            .order('published_at', { ascending: false })
            .limit(1);

        if (error) throw new Error(`Fehler beim Abrufen des News-Datums: ${error.message}`);
        // Extrahiert nur das Datum (YYYY-MM-DD) aus dem Timestamp
        return data && data.length > 0 ? data[0].published_at.split('T')[0] : null;
    };

    return {
        upsertDailySentiment,
        upsertNewsArticle,
        getLatestSentimentDate,
        getLatestNewsDate
    };
}