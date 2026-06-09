const DB_TABLE_DAILY = 'market_daily_candles';
const DB_TABLE_M5 = 'market_m5_candles';

export class CandleRepository {
    constructor(supabaseClient) {
        this.supabaseClient = supabaseClient;
    }

    async getArchivedUntilTimestamp(tickerId) {
        const { data, error } = await this.supabaseClient
            .from('archive_market_m5_log')
            .select('archived_until')
            .eq('ticker', tickerId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return null;
            }
            throw new Error(`Fehler beim Abrufen des Archiv-Timestamps (Ticker ${tickerId}): ${error.message}`);
        }

        return data ? data.archived_until : null;
    }

    async getLatestDailyTimestamp(tickerId) {
        const { data, error } = await this.supabaseClient
            .from(DB_TABLE_DAILY)
            .select('timestamp')
            .eq('ticker', tickerId)
            .order('timestamp', { ascending: false })
            .limit(1)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return null;
            }
            throw new Error(`Fehler beim Abrufen des Timestamps (daily_candles, Ticker ${tickerId}): ${error.message}`);
        }

        return data ? data.timestamp : null;
    }

    async getLatestM5Timestamp(tickerId) {
        const { data, error } = await this.supabaseClient
            .from(DB_TABLE_M5)
            .select('timestamp')
            .eq('ticker', tickerId)
            .order('timestamp', { ascending: false })
            .limit(1)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return null;
            }
            throw new Error(`Fehler beim Abrufen des Timestamps (m5_candles, Ticker ${tickerId}): ${error.message}`);
        }

        return data ? data.timestamp : null;
    }

    // NEUE METHODE: Benötigt für die Sektor-Berechnung, um die Historie für RSI und Momentum zu laden
    async getDailyCandlesSince(tickerId, sinceTimestamp) {
        const { data, error } = await this.supabaseClient
            .from(DB_TABLE_DAILY)
            .select('timestamp, close')
            .eq('ticker', tickerId)
            .gte('timestamp', sinceTimestamp)
            .order('timestamp', { ascending: true });

        if (error) {
            throw new Error(`Fehler beim Abrufen der historischen Kerzen (daily_candles, Ticker ${tickerId}): ${error.message}`);
        }

        return data || [];
    }

    async upsertDailyCandles(tickerId, polygonAggregates) {
        if (!polygonAggregates || polygonAggregates.length === 0) {
            console.log(`Keine Daten zum Upsert für Ticker-ID ${tickerId} in daily_candles.`);
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
            .from(DB_TABLE_DAILY)
            .upsert(mappedCandles, { onConflict: 'ticker, timestamp' });

        if (error) {
            throw new Error(`DB Upsert Error (daily_candles): ${error.message}`);
        }

        console.log(`✅ ${mappedCandles.length} Kerzen in daily_candles verarbeitet (Ticker-ID: ${tickerId}).`);
    }

    async upsertM5Candles(tickerId, polygonAggregates) {
        if (!polygonAggregates || polygonAggregates.length === 0) {
            console.log(`Keine Daten zum Upsert für Ticker-ID ${tickerId} in m5_candles.`);
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
            .from(DB_TABLE_M5)
            .upsert(mappedCandles, { onConflict: 'ticker, timestamp' });

        if (error) {
            throw new Error(`DB Upsert Error (m5_candles): ${error.message}`);
        }

        console.log(`✅ ${mappedCandles.length} Kerzen in m5_candles verarbeitet (Ticker-ID: ${tickerId}).`);
    }
}