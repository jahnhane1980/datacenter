import ky from 'ky';

export const TREASURY_TERMS = Object.freeze({
    BILL: 'Bill',         // Für T-Bills nutzen wir den security_type
    NOTE_2Y: '2-Year',
    NOTE_10Y: '10-Year',
    BOND_20Y: '20-Year'
});

export function createFiscalService() {
    const BASE_URL = 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/auctions_query';

    /**
     * Basis-Funktion zum Abrufen der Auktionsdaten.
     * Unterscheidet automatisch, ob nach Typ (Bills) oder Laufzeit (Notes/Bonds) gefiltert werden muss.
     * * @param {string} filterValue - Der Wert aus TREASURY_TERMS
     * @param {string} startDate - Format 'YYYY-MM-DD'
     * @param {number} limit - Anzahl der zurückgegebenen Datensätze
     */
    const fetchAuctions = async (filterValue, startDate, limit = 50) => {
        // Bills werden über den security_type gefiltert, der Rest über security_term
        const isBill = filterValue === TREASURY_TERMS.BILL;
        const filterKey = isBill ? 'security_type' : 'security_term';
        
        const searchParams = {
            filter: `${filterKey}:eq:${filterValue},auction_date:gte:${startDate}`,
            sort: '-auction_date',
            'page[size]': limit
        };

        try {
            const response = await ky.get(BASE_URL, { searchParams }).json();
            return response.data; // Die Treasury API packt die Ergebnisse in das 'data' Array
        } catch (error) {
            console.error(`Fehler beim Abrufen der Fiscal Data für ${filterValue}:`, error.message);
            throw error;
        }
    };

    /**
     * Bequemlichkeits-Funktion für den täglichen Sync (z.B. letzte 14 Tage)
     */
    const getRecentAuctions = async (filterValue, daysBack = 14) => {
        const date = new Date();
        date.setDate(date.getDate() - daysBack);
        const startDate = date.toISOString().split('T')[0];
        
        return fetchAuctions(filterValue, startDate);
    };

    return {
        fetchAuctions,
        getRecentAuctions
    };
}