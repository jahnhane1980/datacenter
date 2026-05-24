import ky from 'ky';
import 'dotenv/config';
import { ApiConfig } from '../constants/ApiConfig.js';
import { HttpStatus } from '../constants/HttpStatus.js';

export class PolygonIoService {
    constructor() {
        this.apiKey = process.env.POLYGONIO_API_KEY;
        if (!this.apiKey) {
            console.warn('WARNUNG: POLYGONIO_API_KEY fehlt in den Umgebungsvariablen!');
        }

        // Wir entfernen searchParams hier komplett und steuern das manuell
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

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async fetchHistoricalData(ticker, multiplier, timespan, from, to, onChunkReceived) {
        // 1. Initialer Call: API-Key explizit anhängen
        let currentUrl = `aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${from}/${to}?adjusted=true&sort=asc&limit=50000&apiKey=${this.apiKey}`;

        while (currentUrl) {
            try {
                const response = await this.api.get(currentUrl).json();

                // Anstatt im RAM zu sammeln, feuern wir den Chunk direkt an den Manager
                if (response.results && response.results.length > 0) {
                    await onChunkReceived(response.results);
                }

                if (response.next_url) {
                    // 2. Paginierung: Base-URL abschneiden und API-Key explizit wieder anhängen
                    const relativeUrl = response.next_url.replace(`${ApiConfig.POLYGON_BASE_URL}/`, '');
                    currentUrl = `${relativeUrl}&apiKey=${this.apiKey}`;
                    
                    console.log(`Paginierung für ${ticker}: Warte 12 Sekunden (Rate-Limit Schutz)...`);
                    await this.sleep(12000); 
                } else {
                    currentUrl = null; 
                }

            } catch (error) {
                if (error.response && error.response.status === HttpStatus.TOO_MANY_REQUESTS) {
                    console.warn(`Rate Limit erreicht bei ${ticker}. Warte 60 Sekunden...`);
                    await this.sleep(60000);
                } else {
                    throw new Error(`Fehler beim Abrufen der Polygon-Daten für ${ticker}: ${error.message}`);
                }
            }
        }
    }
}