import ky from 'ky';
import 'dotenv/config';
import { ApiConfig } from '../constants/ApiConfig.js';
import { HttpStatus } from '../constants/HttpStatus.js';
import { createPacingManager } from '../managers/PacingManager.js';

export class PolygonIoService {
    constructor(pacingManager = createPacingManager()) {
        this.apiKey = process.env.POLYGONIO_API_KEY;
        this.pacingManager = pacingManager;
        if (!this.apiKey) {
            console.warn('WARNUNG: POLYGONIO_API_KEY fehlt in den Umgebungsvariablen!');
        }

        this.api = ky.create({
            prefix: ApiConfig.POLYGON_BASE_URL,
            timeout: 30000, 
            retry: {
                limit: 3,
                methods: ['get'],
                statusCodes: [
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    HttpStatus.SERVICE_UNAVAILABLE
                ]
            }
        });
    }



    async fetchHistoricalData(ticker, multiplier, timespan, from, to, onChunkReceived) {
        let currentUrl = `aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${from}/${to}?adjusted=true&sort=asc&limit=50000&apiKey=${this.apiKey}`;

        while (currentUrl) {
            try {
                const response = await this.api.get(currentUrl).json();

                if (response.results && response.results.length > 0) {
                    await onChunkReceived(response.results);
                } else {
                    console.log(`[${ticker}] Polygon meldet 0 Ergebnisse von ${from} bis ${to} (Wochenende/Feiertag?).`);
                }

                if (response.next_url) {
                    const relativeUrl = response.next_url.replace(`${ApiConfig.POLYGON_BASE_URL}/`, '');
                    currentUrl = `${relativeUrl}&apiKey=${this.apiKey}`;
                    console.log(`Paginierung für ${ticker}: Warte 12 Sekunden (Rate-Limit Schutz)...`);
                    if (this.pacingManager) await this.pacingManager.sleepMs(12000);
                } else {
                    currentUrl = null; 
                }

            } catch (error) {
                if (error.response && error.response.status === HttpStatus.TOO_MANY_REQUESTS) {
                    console.warn(`Rate Limit erreicht bei ${ticker}. Warte 65 Sekunden...`);
                    if (this.pacingManager) await this.pacingManager.sleepMs(65000);
                } else {
                    throw new Error(`Fehler beim Abrufen der Polygon-Daten für ${ticker}: ${error.message}`);
                }
            }
        }
    }

    /**
     * ERWEITERUNG: Holt historische Kerzen (OHLCV) für einen spezifischen Optionskontrakt (Massive.com Engine).
     * @param {string} optionsTicker - Der OPRA-String (z.B. "O:IBRX260522C00001000")
     * @param {number} multiplier - Intervall-Größe (z.B. 15)
     * @param {string} timespan - Zeiteinheit (z.B. "minute" oder "day")
     * @param {string} from - Startdatum (YYYY-MM-DD)
     * @param {string} to - Enddatum (YYYY-MM-DD)
     * @returns {Promise<Array>} Bereinigte Balken-Daten für die historische Analyse
     */
    async fetchOptionsContractBars(optionsTicker, multiplier = 15, timespan = "minute", from, to) {
        let ticker = optionsTicker;
        if (!ticker.startsWith("O:")) {
            ticker = `O:${ticker}`;
        }

        // Nutzt die exakt gleiche ky-Instanz und URL-Logik deiner bestehenden Architektur
        const url = `aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${from}/${to}?adjusted=true&sort=asc&limit=1000&apiKey=${this.apiKey}`;
        
        console.log(`[Polygon/Massive API] Analysiere Historie für Optionskontrakt ${ticker}...`);

        try {
            const response = await this.api.get(url).json();

            if (!response.results || response.results.length === 0) {
                console.log(`[Polygon/Massive API] Keine Handelsaktivität im Zeitraum für ${ticker}.`);
                return [];
            }

            return response.results.map(bar => ({
                timestamp: bar.t,
                new_york_time: new Date(bar.t).toLocaleString('de-DE', { timeZone: 'America/New_York' }),
                volume: bar.v,
                open: bar.o,
                high: bar.h,
                low: bar.l,
                close: bar.c,
                vwap: bar.vw || bar.c,
                trade_count: bar.n || 0
            }));

        } catch (error) {
            if (error.response && error.response.status === HttpStatus.TOO_MANY_REQUESTS) {
                console.warn(`[Polygon/Massive API] Rate Limit im Options-Endpoint erreicht. Warte 60 Sekunden...`);
                if (this.pacingManager) await this.pacingManager.sleepMs(60000);
                // Einmaliger Retry nach dem Cooldown
                return this.fetchOptionsContractBars(optionsTicker, multiplier, timespan, from, to);
            } else {
                console.error(`[Polygon/Massive API ERROR] Fehler bei Kontrakt ${ticker}: ${error.message}`);
                return [];
            }
        }
    }
}