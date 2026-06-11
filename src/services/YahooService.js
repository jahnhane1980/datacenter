import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['ripHistorical'] });

export const TREASURY_YIELD_MAPPING = {
    '13-Week': '^IRX',
    '5-Year': '^FVX',
    '10-Year': '^TNX',
    '30-Year': '^TYX',
    '9-Year 11-Month': '^TNX',
    '9-Year 10-Month': '^TNX',
    '29-Year 11-Month': '^TYX',
    '29-Year 10-Month': '^TYX'
};

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

    /**
     * Holt den Yield-Wert (Close) für ein spezifisches Datum
     * @param {string} ticker 
     * @param {string} date - Format 'YYYY-MM-DD'
     */
    const fetchYieldForDate = async (ticker, date) => {
        try {
            const d = new Date(date);
            if (isNaN(d.getTime())) return null;

            const nextDay = new Date(d);
            nextDay.setDate(nextDay.getDate() + 1);

            const result = await yahooFinance.historical(ticker, {
                period1: date,
                period2: nextDay.toISOString().split('T')[0]
            });

            if (result && result.length > 0) {
                return result[0].close;
            }
            return null;
        } catch (error) {
            console.error(`Fehler beim Abrufen historischer Yields für ${ticker} am ${date}:`, error.message);
            return null;
        }
    };

    return {
        fetchQuarterlyFundamentals,
        fetchYieldForDate,
        extractMetric
    };
}