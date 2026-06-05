import ky from 'ky';

export function createGlobalMacroService() {
    const FRED_API_KEY = process.env.FRED_API_KEY;
    const BASE_URL = 'https://api.stlouisfed.org/fred/series/observations';

    /**
     * Holt Zeitreihendaten (Bilanzen oder FX-Kurse) von der FRED API.
     * @param {string} seriesId - Der FRED Ticker (z.B. 'ECBASSETS' oder 'DEXUSEU')
     * @param {string} startDate - Format 'YYYY-MM-DD'
     */
    const fetchSeriesData = async (seriesId, startDate) => {
        if (!FRED_API_KEY) {
            throw new Error('FRED_API_KEY fehlt in der .env Datei. Bitte eintragen.');
        }

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
            console.error(`Fehler beim Abrufen der FRED-Daten für ${seriesId}:`, error.message);
            throw error;
        }
    };

    return {
        fetchSeriesData
    };
}