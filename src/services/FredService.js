import ky from 'ky';

export const FRED_SERIES = Object.freeze({
    BANK_TERM_FUNDING_PROGRAM: 'H41RESPPALDKNWW',
    REVERSE_REPO: 'RRPONTSYD',
    TGA_BALANCE: 'WTREGEN',
    FED_BALANCE_SHEET: 'WALCL',
    BANK_RESERVES_FED_WEEKLY: 'WRESBAL',
    SECURED_OVERNIGHT_FINANCING_RATE: 'SOFR',
    DEPOSITS_ALL: 'DPSACBW027SBOG', // Korrigiert: Deposits, All Commercial Banks (Weekly)
    DEMAND_DEPOSITS: 'WDDNS'        // Korrigiert: Demand Deposits (Weekly)
});

export function createFredService(apiKey = process.env.FRED_API_KEY) {
    if (!apiKey) {
        throw new Error('FRED_API_KEY ist nicht definiert. Bitte in der .env oder den Github Secrets setzen.');
    }

    const BASE_URL = 'https://api.stlouisfed.org/fred/series/observations';

    /**
     * Basis-Funktion zum Abrufen einer spezifischen Serie
     */
    const fetchObservations = async (seriesId, startDate, endDate = null) => {
        const searchParams = {
            series_id: seriesId,
            api_key: apiKey,
            file_type: 'json',
            observation_start: startDate
        };

        if (endDate) {
            searchParams.observation_end = endDate;
        }

        try {
            const response = await ky.get(BASE_URL, { 
                searchParams,
                timeout: 30000,
                retry: {
                    limit: 3,
                    statusCodes: [408, 413, 429, 500, 502, 503, 504],
                    methods: ['get']
                }
            }).json();
            return response.observations;
        } catch (error) {
            console.error(`Fehler beim Abrufen der FRED Serie ${seriesId}:`, error.message);
            throw error;
        }
    };

    /**
     * Für sync-fred-backfill.js: Holt alle Daten ab 01.01.2021
     */
    const getBackfillData = async (seriesId) => {
        return fetchObservations(seriesId, '2021-01-01');
    };

    /**
     * Für sync-fred.js: Holt die Daten der letzten X Tage (Standard: 7)
     */
    const getRecentData = async (seriesId, daysBack = 7) => {
        const date = new Date();
        date.setDate(date.getDate() - daysBack);
        
        // Formatiert das Datum zu YYYY-MM-DD
        const startDate = date.toISOString().split('T')[0];
        
        return fetchObservations(seriesId, startDate);
    };

    return {
        fetchObservations,
        getBackfillData,
        getRecentData
    };
}