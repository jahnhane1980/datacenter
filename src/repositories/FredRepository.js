import { supabaseClient } from '../core/SupabaseClient.js';

export function createFredRepository() {
    /**
     * Erstellt oder aktualisiert einen Makro-Liquiditäts-Datensatz an einem bestimmten Tag.
     * Nutzt den upsert-Mechanismus von Supabase auf Basis des Primary Keys 'observation_date'.
     * * @param {string} observationDate - Das Datum im Format 'YYYY-MM-DD'
     * @param {number|null} tgaBalance - Der Wert für WTREGEN
     * @param {number|null} rrpBalance - Der Wert für RRPONTSYD
     * @param {number|null} fedBalance - Der Wert für WALCL
     * @param {number|null} btfpBalance - Der Wert für H41RESPPALDKNWW
     * @param {number|null} bankReservesFed - Der Wert für WRESBAL
     * @param {number|null} sofrRate - Der Wert für SOFR
     * @throws {Error} Wenn der Upsert in der Supabase-Datenbank fehlschlägt.
     */
    const upsertMacroData = async (observationDate, tgaBalance, rrpBalance, fedBalance, btfpBalance, bankReservesFed, sofrRate) => {
        const { error } = await supabaseClient
            .from('macro_liquidity')
            .upsert(
                { 
                    observation_date: observationDate,
                    tga_balance: tgaBalance,
                    rrp_balance: rrpBalance,
                    fed_balance: fedBalance,
                    btfp_balance: btfpBalance,
                    bank_reserves_fed: bankReservesFed,
                    sofr_rate: sofrRate
                }, 
                { onConflict: 'observation_date' }
            );

        if (error) {
            throw new Error(`Fehler beim Upsert in macro_liquidity: ${error.message}`);
        }
    };

    /**
     * Holt das aktuellste (jüngste) observation_date aus der macro_liquidity Tabelle.
     * @returns {Promise<string|null>} Das Datum als String (YYYY-MM-DD) oder null, wenn leer.
     */
    const getLatestObservationDate = async () => {
        const { data, error } = await supabaseClient
            .from('macro_liquidity')
            .select('observation_date')
            .order('observation_date', { ascending: false })
            .limit(1);

        if (error) {
            throw new Error(`Fehler beim Abrufen des letzten Datums: ${error.message}`);
        }

        return data && data.length > 0 ? data[0].observation_date : null;
    };

    return {
        upsertMacroData,
        getLatestObservationDate
    };
}