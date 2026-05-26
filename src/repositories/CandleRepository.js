export class CandleRepository {
    constructor(supabaseClient) {
        this.supabaseClient = supabaseClient;
    }

    async getLatestTimestamp(tableName, tickerId) {
        const { data, error } = await this.supabaseClient
            .from(tableName)
            .select('timestamp')
            .eq('ticker', tickerId)
            .order('timestamp', { ascending: false })
            .limit(1)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return null;
            }
            throw new Error(`Fehler beim Abrufen des Timestamps (${tableName}, Ticker ${tickerId}): ${error.message}`);
        }

        return data ? data.timestamp : null;
    }

    // NEUE METHODE: Benötigt für die Sektor-Berechnung, um die Historie für RSI und Momentum zu laden
    async getCandlesSince(tableName, tickerId, sinceTimestamp) {
        const { data, error } = await this.supabaseClient
            .from(tableName)
            .select('timestamp, close')
            .eq('ticker', tickerId)
            .gte('timestamp', sinceTimestamp)
            .order('timestamp', { ascending: true });

        if (error) {
            throw new Error(`Fehler beim Abrufen der historischen Kerzen (${tableName}, Ticker ${tickerId}): ${error.message}`);
        }

        return data || [];
    }

    async upsertCandles(tableName, tickerId, polygonAggregates) {
        if (!polygonAggregates || polygonAggregates.length === 0) {
            console.log(`Keine Daten zum Upsert für Ticker-ID ${tickerId} in ${tableName}.`);
            return;
        }

        // Mapping und sauberes Runden (Ganzzahlen) für Volumen und Trades
        const mappedCandles = polygonAggregates.map(candle => ({
            ticker: tickerId,
            timestamp: Math.floor(candle.t / 1000),
            open: candle.o,
            high: candle.h,
            low: candle.l,
            close: candle.c,
            volume: candle.v ? Math.round(candle.v) : 0,           // Runden zu Ganzzahl
            vwap: candle.vw || null,
            trades: candle.n ? Math.round(candle.n) : null         // Runden zu Ganzzahl
        }));

        const { error } = await this.supabaseClient
            .from(tableName)
            .upsert(mappedCandles, { onConflict: 'ticker, timestamp' });

        if (error) {
            throw new Error(`DB Upsert Error (${tableName}): ${error.message}`);
        }

        console.log(`✅ ${mappedCandles.length} Kerzen in ${tableName} verarbeitet (Ticker-ID: ${tickerId}).`);
    }
}