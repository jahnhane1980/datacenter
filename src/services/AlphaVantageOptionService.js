import ky from 'ky';
import 'dotenv/config';
import { createPacingManager } from '../managers/PacingManager.js';

/**
 * AlphaVantageOptionService
 * Übernimmt die Breitband-Analyse der gesamten Optionskette.
 * Integriert einen persistenten Instanz-Counter zum Schutz des 25-Calls-Tageslimits.
 */
export class AlphaVantageOptionService {
    constructor(pacingManager = createPacingManager()) {
        this.apiKey = process.env.ALPHAVANTAGE_API_KEY;
        this.pacingManager = pacingManager;
        
        if (!this.apiKey) {
            console.warn('WARNUNG: ALPHAVANTAGE_API_KEY fehlt in den Umgebungsvariablen!');
        }

        // Der interne Call-Counter für diese Workflow-Ausführung
        this.callCounter = 0;
        this.MAX_FREE_CALLS = 25;

        this.api = ky.create({
            prefixUrl: 'https://www.alphavantage.co',
            timeout: 30000,
            retry: {
                limit: 3,
                methods: ['get'],
                statusCodes: [500, 503]
            }
        });
    }

    /**
     * Prüft das Kontingent, bevor ein teurer API-Call abgesetzt wird.
     * @private
     * @returns {boolean} True, wenn der Call erlaubt ist, andernfalls False.
     */
    _checkAndIncrementCounter(endpointName) {
        if (this.callCounter >= this.MAX_FREE_CALLS) {
            console.warn(`[AlphaVantage Counter] BLOCKIERT: Tageslimit von ${this.MAX_FREE_CALLS} Calls ist für diesen Lauf erreicht. Überspringe ${endpointName}.`);
            return false;
        }
        this.callCounter++;
        console.log(`[AlphaVantage Counter] Call ${this.callCounter}/${this.MAX_FREE_CALLS} wird ausgeführt für: ${endpointName}`);
        return true;
    }

    /**
     * Interner Burst-Schutz, um das Limit von 1 Request/Sekunde im Free-Tier sicher einzuhalten.
     * @private
     */
    async _burstDelay() {
        console.log(`[Pacing] Warte 3.5 Sekunden (AlphaVantage Rate Limit)...`);
        if (this.pacingManager) await this.pacingManager.sleepMs(3500);
    }

    /**
     * Holt das Echtzeit-Volumen-zu-Open-Interest-Verhältnis für die gesamte Kette (Intraday).
     * @param {string} symbol - Das Tickersymbol (z.B. "IBRX")
     * @returns {Promise<Array>} Bereinigte Datensätze für deine Snapshot-Strukturen
     */
    async fetchIntradayRatios(symbol) {
        // Kontingent-Check vor Ausführung
        if (!this._checkAndIncrementCounter(`Intraday-Ratios (${symbol})`)) {
            return [];
        }

        const upperSymbol = symbol.toUpperCase();
        const path = `query?function=REALTIME_VOLUME_OPEN_INTEREST_RATIO&symbol=${upperSymbol}&apikey=${this.apiKey}`;
        
        await this._burstDelay();

        try {
            const json = await this.api.get(path).json();

            if (json["Note"] || json["Information"]) {
                console.warn(`[AlphaVantage API WARNING] Hartes Limit auf Server-Ebene erreicht:`, json["Note"] || json["Information"]);
                return [];
            }

            if (!json.data || json.data.length === 0) {
                console.log(`[AlphaVantage API] Keine Kontrakte für Ticker ${upperSymbol} gefunden.`);
                return [];
            }

            return json.data.map(contract => ({
                contract_id: contract.contractID,
                symbol: contract.symbol,
                expiration_date: contract.expiration,
                strike: parseFloat(contract.strike),
                option_type: contract.type.toUpperCase(),
                volume_oi_ratio: contract.volume_open_interest_ratio ? parseFloat(contract.volume_open_interest_ratio) : 0
            }));

        } catch (error) {
            console.error(`[AlphaVantage API ERROR] Fehler bei Intraday-Abfrage für ${upperSymbol}: ${error.message}`);
            return [];
        }
    }

    /**
     * Holt das Put-Call-Ratio der gesamten Kette für EOD-Makro-Analysen.
     * @param {string} symbol - Das Tickersymbol (z.B. "IBRX")
     * @returns {Promise<Object|null>} Objekt mit dem globalen Ratio und den Laufzeit-Ratios
     */
    async fetchPutCallRatios(symbol) {
        // Kontingent-Check vor Ausführung
        if (!this._checkAndIncrementCounter(`Put-Call-Ratio (${symbol})`)) {
            return null;
        }

        const upperSymbol = symbol.toUpperCase();
        const path = `query?function=REALTIME_PUT_CALL_RATIO&symbol=${upperSymbol}&apikey=${this.apiKey}`;

        await this._burstDelay();

        try {
            const json = await this.api.get(path).json();

            if (json["Note"] || json["Information"]) {
                console.warn(`[AlphaVantage API WARNING] Hartes Limit auf Server-Ebene erreicht:`, json["Note"] || json["Information"]);
                return null;
            }

            return {
                full_chain_ratio: parseFloat(json.put_call_ratio_full_chain) || 0,
                by_expiration: (json.put_call_ratio_by_expiration || []).map(item => ({
                    expiration_date: item.date,
                    ratio_value: parseFloat(item.value) || 0
                }))
            };

        } catch (error) {
            console.error(`[AlphaVantage API ERROR] Fehler bei Put-Call-Ratio für ${upperSymbol}: ${error.message}`);
            return null;
        }
    }
}