import ky from 'ky';

export const TREASURY_TYPES = Object.freeze({
    BILL: 'Bill',
    NOTE: 'Note',
    BOND: 'Bond'
});

export function createFiscalService() {
    const BASE_URL = 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/auctions_query';

    /**
     * Basis-Funktion zum Abrufen der Auktionsdaten.
     * Filtert nun generisch nach dem Wertpapier-Typ (Bill, Note, Bond), um ALLE Laufzeiten zu erfassen.
     * @param {string} securityType - Der Wert aus TREASURY_TYPES
     * @param {string} startDate - Format 'YYYY-MM-DD'
     * @param {number} limit - Anzahl der zurückgegebenen Datensätze
     */
    const fetchAuctions = async (securityType, startDate, limit = 50) => {
        const searchParams = {
            filter: `security_type:eq:${securityType},auction_date:gte:${startDate}`,
            sort: '-auction_date',
            'page[size]': limit
        };

        try {
            const response = await ky.get(BASE_URL, { searchParams }).json();
            return response.data; // Die Treasury API packt die Ergebnisse in das 'data' Array
        } catch (error) {
            console.error(`Fehler beim Abrufen der Fiscal Data für ${securityType}:`, error.message);
            throw error;
        }
    };

    /**
     * Bequemlichkeits-Funktion für den täglichen Sync (z.B. letzte 14 Tage)
     */
    const getRecentAuctions = async (securityType, daysBack = 14) => {
        const date = new Date();
        date.setDate(date.getDate() - daysBack);
        const startDate = date.toISOString().split('T')[0];
        
        return fetchAuctions(securityType, startDate);
    };

    return {
        fetchAuctions,
        getRecentAuctions
    };
}