import ky from 'ky';

export function createLaborMarketService() {
    const FRED_API_KEY = process.env.FRED_API_KEY;
    const BASE_URL = 'https://api.stlouisfed.org/fred/series/observations';

    const fetchSeriesData = async (seriesId, startDate) => {
        if (!FRED_API_KEY) throw new Error('FRED_API_KEY fehlt in der .env Datei.');

        const searchParams = {
            series_id: seriesId,
            api_key: FRED_API_KEY,
            file_type: 'json',
            observation_start: startDate,
            sort_order: 'asc'
        };

        try {
            const response = await ky.get(BASE_URL, { searchParams }).json();
            return response.observations;
        } catch (error) {
            console.error(`Fehler beim Abrufen der Arbeitsmarktdaten für ${seriesId}:`, error.message);
            throw error;
        }
    };

    return {
        fetchSeriesData
    };
}