

const DB_TABLE = 'ticker';

export const SYNC_JOBS = Object.freeze({
    DAILY: 'DAILY',
    M5: 'M5',
    OPTIONS: 'OPTIONS',
    SHORT_VOLUME: 'SHORT_VOLUME',
    SENTIMENT: 'SENTIMENT',
    EVENTS: 'EVENTS',
    SECTOR_ROTATION: 'SECTOR_ROTATION'
});

export function createTickerRepository(supabaseClient) {
    /**
     * Holt alle Ticker aus der Datenbank, optional gefiltert nach Typ.
     * @param {number|null} typeId - Die ID des Ticker-Typs (z.B. 3 für STOCK). Null = Alle.
     * @returns {Promise<Array>} Liste der Ticker
     */
    const getAllTickers = async (typeId = null) => {
        // HIER IST DER FIX: Wir zwingen Supabase, die ticker_typ_id mit in das JSON-Objekt zu packen!
        let query = supabaseClient.from(DB_TABLE).select('id, name, ticker_typ_id');
        
        if (typeId !== null) {
            query = query.eq('ticker_typ_id', typeId);
        }

        const { data, error } = await query;

        if (error) {
            throw new Error(`[TickerRepository] Fehler beim Abrufen der Ticker: ${error.message}`);
        }

        return data;
    };

    /**
     * Holt alle Ticker, die in der Konfigurations-Tabelle für einen bestimmten Job aktiviert sind.
     * @param {string} jobName - Der Name des Sync-Jobs (aus SYNC_JOBS)
     * @returns {Promise<Array>} Liste der konfigurierten Ticker
     */
    const getTickersForJob = async (jobName) => {
        const { data, error } = await supabaseClient
            .from('ticker_data_config')
            .select(`
                ticker_id,
                ticker(id, name, ticker_typ_id)
            `)
            .eq('sync_type', jobName)
            .eq('is_active', true);

        if (error) {
            throw new Error(`[TickerRepository] Fehler in getTickersForJob(${jobName}): ${error.message}`);
        }

        if (!data) return [];
        return data
            .filter(row => row.ticker !== null)
            .map(row => row.ticker);
    };

    return {
        getAllTickers,
        getTickersForJob
    };
}