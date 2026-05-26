import { supabaseClient } from '../core/SupabaseClient.js';

export function createTickerRepository() {
    /**
     * Holt alle Ticker aus der Datenbank, optional gefiltert nach Typ.
     * @param {number|null} typeId - Die ID des Ticker-Typs (z.B. 3 für STOCK). Null = Alle.
     * @returns {Promise<Array>} Liste der Ticker
     */
    const getAllTickers = async (typeId = null) => {
        // HIER IST DER FIX: Wir zwingen Supabase, die ticker_typ_id mit in das JSON-Objekt zu packen!
        let query = supabaseClient.from('ticker').select('id, name, ticker_typ_id');
        
        if (typeId !== null) {
            query = query.eq('ticker_typ_id', typeId);
        }

        const { data, error } = await query;

        if (error) {
            throw new Error(`[TickerRepository] Fehler beim Abrufen der Ticker: ${error.message}`);
        }

        return data;
    };

    return {
        getAllTickers
    };
}