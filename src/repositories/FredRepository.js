

const DB_TABLE_LIQUIDITY = 'macro_us_liquidity';
const DB_TABLE_INDICATOR_VALUES = 'macro_us_indicator_values';
const DB_TABLE_INDICATOR_DEFINITION = 'macro_us_indicator_definition';

export function createFredRepository(supabaseClient) {
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
            .from(DB_TABLE_LIQUIDITY)
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
     * Schreibt ein Array von formatierten Indikator-Werten in die normalisierte Struktur.
     * @param {Array} valuesArray - Array von Objekten { indicator_id, observation_date, value }
     */
    const upsertMacroIndicatorValues = async (valuesArray) => {
        if (!valuesArray || valuesArray.length === 0) return;

        const { error } = await supabaseClient
            .from(DB_TABLE_INDICATOR_VALUES)
            .upsert(valuesArray, { onConflict: 'indicator_id, observation_date' });

        if (error) {
            throw new Error(`Fehler beim Upsert in macro_indicator_values: ${error.message}`);
        }
    };

    /**
     * Holt das Lexikon aller definierten Makro-Indikatoren, um die FRED-Series-IDs auf interne IDs zu mappen.
     * @returns {Promise<Array>} Array von { id, series_id }
     */
    const getMacroIndicatorDefinitions = async () => {
        const { data, error } = await supabaseClient
            .from(DB_TABLE_INDICATOR_DEFINITION)
            .select('id, series_id');

        if (error) {
            throw new Error(`Fehler beim Abrufen der Makro-Definitionen: ${error.message}`);
        }

        return data || [];
    };

    /**
     * Holt das aktuellste (jüngste) observation_date aus der macro_liquidity Tabelle.
     * @returns {Promise<string|null>} Das Datum als String (YYYY-MM-DD) oder null, wenn leer.
     */
    const getLatestObservationDate = async () => {
        const { data, error } = await supabaseClient
            .from(DB_TABLE_LIQUIDITY)
            .select('observation_date')
            .order('observation_date', { ascending: false })
            .limit(1);

        if (error) {
            throw new Error(`Fehler beim Abrufen des letzten Datums: ${error.message}`);
        }

        return data && data.length > 0 ? data[0].observation_date : null;
    };

    /**
     * Holt die aktuellsten Werte für einen spezifischen FRED Indikator (z.B. 'T10Y2Y').
     * @param {string} seriesId - Der FRED Ticker
     * @param {number} limit - Anzahl der Datensätze
     * @returns {Promise<Array>} Array von { observation_date, value }
     */
    const getHistoricalIndicatorValues = async (seriesId, limit = 25) => {
        const { data: defData, error: defError } = await supabaseClient
            .from(DB_TABLE_INDICATOR_DEFINITION)
            .select('id')
            .eq('series_id', seriesId)
            .single();

        if (defError || !defData) {
            return []; 
        }

        const { data, error } = await supabaseClient
            .from(DB_TABLE_INDICATOR_VALUES)
            .select('observation_date, value')
            .eq('indicator_id', defData.id)
            .order('observation_date', { ascending: false })
            .limit(limit);

        if (error) {
            throw new Error(`Fehler beim Abrufen der historischen Werte für ${seriesId}: ${error.message}`);
        }

        return data || [];
    };

    return {
        upsertMacroData,
        upsertMacroIndicatorValues,
        getMacroIndicatorDefinitions,
        getLatestObservationDate,
        getHistoricalIndicatorValues
    };
}