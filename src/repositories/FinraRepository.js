

const DB_TABLE = 'market_finra_short_volume';

export class FinraRepository {
    constructor(supabaseClient) {
        this.supabaseClient = supabaseClient;
    }

    /**
     * Erstellt oder aktualisiert einen Short-Sale-Datensatz für einen Ticker an einem bestimmten Tag.
     * @param {number} tickerId - Die ID des Tickers aus der Tabelle 'ticker'.
     * @param {number} timestamp - Der Unix-Timestamp (in Sekunden) für den Handelstag.
     * @param {number} shortVolume - Das gemeldete Short-Volume.
     * @param {number} totalVolume - Das gemeldete Gesamt-Volume.
     * @throws {Error} Wenn der Upsert in der Supabase-Datenbank fehlschlägt.
     */
    async upsertShortData(tickerId, timestamp, shortVolume, totalVolume) {
        const { error } = await this.supabaseClient
            .from(DB_TABLE)
            .upsert(
                { 
                    ticker: tickerId, 
                    timestamp: timestamp, 
                    short_volume: shortVolume, 
                    total_volume: totalVolume 
                }, 
                { onConflict: 'ticker,timestamp' }
            );

        if (error) {
            throw new Error(`Fehler beim Upsert in finra_short_volume: ${error.message}`);
        }
    }

    /**
     * Holt den neuesten verfügbaren Unix-Timestamp. 
     * Wenn eine tickerId übergeben wird, spezifisch für diesen Ticker; 
     * andernfalls global für die gesamte Tabelle.
     * @param {number|null} [tickerId=null] - Optionale ID des Tickers.
     * @returns {Promise<number|null>} Der neueste Timestamp in Sekunden oder null.
     * @throws {Error} Wenn die Abfrage fehlschlägt.
     */
    async getLatestTimestamp(tickerId = null) {
        let query = this.supabaseClient
            .from(DB_TABLE)
            .select('timestamp');

        if (tickerId) {
            query = query.eq('ticker', tickerId);
        }

        query = query.order('timestamp', { ascending: false }).limit(1);

        const { data, error } = await query;

        if (error) {
            throw new Error(`Fehler beim Holen des neuesten FINRA-Timestamps: ${error.message}`);
        }

        return data && data.length > 0 ? data[0].timestamp : null;
    }

    /**
     * Ermittelt alle eindeutigen Monate (im Format "YYYY-MM"), für die bereits Datensätze
     * in der Tabelle 'finra_short_volume' existieren.
     * @returns {Promise<Set<string>>} Ein Set mit Strings der bereits vorhandenen Monate.
     * @throws {Error} Wenn die Gruppierungsabfrage fehlschlägt.
     */
    async getExistingMonths() {
        const { data, error } = await this.supabaseClient
            .from(DB_TABLE)
            .select('timestamp')
            .order('timestamp', { ascending: false });

        if (error) {
            throw new Error(`Fehler beim Ermitteln der vorhandenen Monate: ${error.message}`);
        }

        const existingMonths = new Set();
        if (data && data.length > 0) {
            for (const row of data) {
                if (row.timestamp) {
                    const date = new Date(row.timestamp * 1000);
                    const year = date.getUTCFullYear();
                    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
                    existingMonths.add(`${year}-${month}`);
                }
            }
        }

        return existingMonths;
    }
}