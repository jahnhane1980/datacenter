import yahooFinance from 'yahoo-finance2';

export function createYahooService() {

    /**
     * Holt die aktuellsten Quartalszahlen (Income Statement, Cash Flow, Balance Sheet)
     * von Yahoo Finance für einen Ticker.
     * @param {string} ticker - z.B. 'AMZN', 'PANW'
     */
    const fetchQuarterlyFundamentals = async (ticker) => {
        try {
            // Wir definieren genau, welche Module wir von Yahoo haben wollen
            const queryOptions = {
                modules: [
                    'incomeStatementHistoryQuarterly',
                    'cashflowStatementHistoryQuarterly',
                    'balanceSheetHistoryQuarterly'
                ]
            };

            const result = await yahooFinance.quoteSummary(ticker, queryOptions);
            return result;
            
        } catch (error) {
            throw new Error(`Fehler beim Abrufen der Yahoo Finance Daten für ${ticker}: ${error.message}`);
        }
    };

    /**
     * Eine kleine Hilfsfunktion, um die wilden Yahoo-Datenpunkte
     * in unser sauberes Datenbank-Format zu übersetzen.
     */
    const extractMetric = (metricObject) => {
        if (!metricObject) return null;
        // Manche Zahlen kommen als "raw", manche als einfaches Feld
        if (typeof metricObject === 'object' && metricObject.raw !== undefined) {
            return metricObject.raw;
        }
        return metricObject;
    };

    return {
        fetchQuarterlyFundamentals,
        extractMetric
    };
}