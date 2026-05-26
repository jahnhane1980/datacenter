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
     * @throws {Error} Wenn der Upsert in der Supabase-Datenbank fehlschlägt.
     */
    const upsertMacroData = async (observationDate, tgaBalance, rrpBalance, fedBalance, btfpBalance) => {
        const { error } = await supabaseClient
            .from('macro_liquidity')
            .upsert(
                { 
                    observation_date: observationDate,
                    tga_balance: tgaBalance,
                    rrp_balance: rrpBalance,
                    fed_balance: fedBalance,
                    btfp_balance: btfpBalance
                }, 
                { onConflict: 'observation_date' }
            );

        if (error) {
            throw new Error(`Fehler beim Upsert in macro_liquidity: ${error.message}`);
        }
    };

    return {
        upsertMacroData
    };
}