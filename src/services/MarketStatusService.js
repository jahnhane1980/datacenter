import ky from 'ky';
import 'dotenv/config';
import { ApiConfig } from '../constants/ApiConfig.js';

export class MarketStatusService {
    constructor() {
        this.apiKey = process.env.POLYGONIO_API_KEY;
    }

    async isMarketOpen() {
        try {
            const response = await ky.get(ApiConfig.MARKET_STATUS_URL, {
                searchParams: { apiKey: this.apiKey }
            }).json();

            // Polygon liefert in response.market den Status (z.B. "open", "closed", "extended-hours")
            return response.market === 'open';
        } catch (error) {
            console.error(`Fehler bei der Market-Status-Abfrage: ${error.message}`);
            // Fallback: Im Zweifel lieber true zurückgeben und versuchen Daten zu holen, als den Sync grundlos zu blockieren
            return true; 
        }
    }
}