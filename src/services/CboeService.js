import ky from 'ky';
import { parse } from 'csv-parse/sync';

export class CboeService {
    constructor() {
        this.api = ky.create({
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/csv,application/csv,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Origin': 'https://www.cboe.com',
                'Referer': 'https://www.cboe.com/us/options/market_statistics/historical_data/'
            },
            timeout: 60000 // Erhöht auf 60s für den großen 2-Jahres-Backfill
        });
    }

    async fetchOptionsVolume(symbol, fromDateStr, toDateStr) {
        // Exakter Pfad aus deinem HTML-Auszug!
        const url = 'https://www.cboe.com/us/options/market_statistics/historical_data/download/class/';
        
        // Exakte Parameter-Struktur aus deinem extrahierten <a>-Link
        const searchParams = {
            reportType: 'volume',
            volumeType: 'sum',
            volumeAggType: 'daily',
            symbolType: 'osiRoot', // Wichtig: osiRoot statt underlying!
            symbol: symbol.toUpperCase(),
            startDate: fromDateStr,
            endDate: toDateStr,
            exchanges: 'CBOE'       // Aus deinem Checkbox-Element
        };

        try {
            console.log(`[CBOE] Rufe Daten ab für ${symbol} (${fromDateStr} bis ${toDateStr})...`);
            
            const responseText = await this.api.get(url, { searchParams }).text();

            if (!responseText || responseText.trim().length === 0 || responseText.includes('No data found')) {
                console.log(`[CBOE] Keine Daten für ${symbol} im gewählten Zeitraum gefunden.`);
                return [];
            }

            // CSV in JSON-Objekte parsen
            const records = parse(responseText, {
                columns: true,
                skip_empty_lines: true,
                trim: true
            });

            return records;
        } catch (error) {
            throw new Error(`CBOE-GET fehlgeschlagen für ${symbol}: ${error.message}`);
        }
    }
}