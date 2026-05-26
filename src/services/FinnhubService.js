import ky from 'ky';
import 'dotenv/config';

/**
 * FinnhubService
 * Übernimmt die Kommunikation mit der Finnhub API für Kalender-Daten (Earnings, FDA etc.).
 */
export class FinnhubService {
    constructor() {
        this.apiKey = process.env.FINNHUB_API_KEY;
        if (!this.apiKey) {
            console.warn('WARNUNG: FINNHUB_API_KEY fehlt in den Umgebungsvariablen!');
        }

        // FIX: ky Version 2 nutzt 'prefix' statt 'prefixUrl' (Konsistent zur AlphaVantage-Klasse)
        this.api = ky.create({
            prefix: 'https://finnhub.io/api/v1',
            timeout: 30000,
            retry: {
                limit: 3,
                methods: ['get'],
                statusCodes: [429, 500, 503] // 429 (Too Many Requests) hinzugefügt
            }
        });
    }

    /**
     * Interne Methode für den API-Aufruf mit automatischem Token-Append.
     * @private
     */
    async _fetch(endpoint, searchParams = {}) {
        const params = { token: this.apiKey, ...searchParams };

        try {
            return await this.api.get(endpoint, { searchParams: params }).json();
        } catch (error) {
            console.error(`[FinnhubService ERROR] Fehler beim Abruf von ${endpoint}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Holt den Earnings-Kalender für einen definierten Zeitraum.
     * @param {string} fromDate - Startdatum im Format YYYY-MM-DD
     * @param {string} toDate - Enddatum im Format YYYY-MM-DD
     * @returns {Promise<Object>} JSON Response der API
     */
    async getEarningsCalendar(fromDate, toDate) {
        return await this._fetch('calendar/earnings', {
            from: fromDate,
            to: toDate
        });
    }

    /**
     * Holt den FDA-Advisory-Kalender.
     * @returns {Promise<Array>} JSON Array der API
     */
    async getFdaCalendar() {
        return await this._fetch('fda-advisory-committee-calendar');
    }
}