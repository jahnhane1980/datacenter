import { supabaseClient } from '../core/SupabaseClient.js';

const DB_TABLE_SERIES = 'labor_market_series';
const DB_TABLE_DATA_POINTS = 'labor_market_data_points';

export function createLaborMarketRepository() {
    
    const getSeries = async () => {
        const { data, error } = await supabaseClient
            .from(DB_TABLE_SERIES)
            .select('id, name, category, frequency');

        if (error) throw new Error(`Fehler beim Laden der Labor Market Series: ${error.message}`);
        return data;
    };

    const getLatestDate = async (seriesId) => {
        const { data, error } = await supabaseClient
            .from(DB_TABLE_DATA_POINTS)
            .select('data_period')
            .eq('series_id', seriesId)
            .order('data_period', { ascending: false })
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') {
            throw new Error(`Fehler beim Laden des letzten Datums für ${seriesId}: ${error.message}`);
        }
        return data ? data.data_period : null;
    };

    const upsertDataPoint = async (seriesId, dataPeriod, releaseDate, value, isPreliminary) => {
        const { error } = await supabaseClient
            .from(DB_TABLE_DATA_POINTS)
            .upsert(
                { 
                    series_id: seriesId, 
                    data_period: dataPeriod,
                    release_date: releaseDate,
                    value: value,
                    is_preliminary: isPreliminary
                },
                { onConflict: 'series_id, data_period' }
            );

        if (error) throw new Error(`Fehler beim Upsert von ${seriesId} am ${dataPeriod}: ${error.message}`);
    };

    return {
        getSeries,
        getLatestDate,
        upsertDataPoint
    };
}