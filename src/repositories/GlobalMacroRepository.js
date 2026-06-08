import { supabaseClient } from '../core/SupabaseClient.js';

const DB_TABLE_DEFINITION = 'macro_global_indicator_definition';
const DB_TABLE_VALUES = 'macro_global_indicator_values';
const DB_TABLE_FX_RATES = 'macro_fx_rates_daily';

export function createGlobalMacroRepository() {
    
    /**
     * Lädt das globale Lexikon (die zu synchronisierenden Indikatoren).
     */
    const getDefinitions = async () => {
        const { data, error } = await supabaseClient
            .from(DB_TABLE_DEFINITION)
            .select('id, series_id, region, currency');

        if (error) {
            throw new Error(`Fehler beim Laden der globalen Definitionen: ${error.message}`);
        }
        return data;
    };

    /**
     * Holt das Datum des aktuellsten Eintrags für einen Indikator.
     */
    const getLatestGlobalDate = async (indicatorId) => {
        const { data, error } = await supabaseClient
            .from(DB_TABLE_VALUES)
            .select('observation_date')
            .eq('indicator_id', indicatorId)
            .order('observation_date', { ascending: false })
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = No rows found
            throw new Error(`Fehler beim Laden des letzten Datums für Indikator ${indicatorId}: ${error.message}`);
        }
        return data ? data.observation_date : null;
    };

    /**
     * Schreibt die rohen Bilanzdaten in die globale Wertetabelle.
     */
    const upsertGlobalData = async (indicatorId, observationDate, rawValue) => {
        const { error } = await supabaseClient
            .from(DB_TABLE_VALUES)
            .upsert(
                { 
                    indicator_id: indicatorId, 
                    observation_date: observationDate, 
                    raw_value: rawValue 
                },
                { onConflict: 'indicator_id, observation_date' }
            );

        if (error) {
            throw new Error(`Fehler beim Upsert von ${indicatorId} am ${observationDate}: ${error.message}`);
        }
    };

    /**
     * Holt das Datum des aktuellsten Eintrags für ein Währungspaar.
     */
    const getLatestFxDate = async (currencyPair) => {
        const { data, error } = await supabaseClient
            .from(DB_TABLE_FX_RATES)
            .select('observation_date')
            .eq('currency_pair', currencyPair)
            .order('observation_date', { ascending: false })
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') {
            throw new Error(`Fehler beim Laden des letzten Datums für FX ${currencyPair}: ${error.message}`);
        }
        return data ? data.observation_date : null;
    };

    /**
     * Schreibt die Wechselkurse in die FX-Brücken-Tabelle.
     */
    const upsertFxRate = async (observationDate, currencyPair, rate) => {
        const { error } = await supabaseClient
            .from(DB_TABLE_FX_RATES)
            .upsert(
                { 
                    observation_date: observationDate, 
                    currency_pair: currencyPair, 
                    rate: rate 
                },
                { onConflict: 'observation_date, currency_pair' }
            );

        if (error) {
            throw new Error(`Fehler beim Upsert der FX-Rate ${currencyPair} am ${observationDate}: ${error.message}`);
        }
    };

    return {
        getDefinitions,
        getLatestGlobalDate,
        upsertGlobalData,
        getLatestFxDate,
        upsertFxRate
    };
}