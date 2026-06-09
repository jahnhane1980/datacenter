import { SYNC_JOBS } from '../repositories/TickerRepository.js';

export class OptionsController {
    /**
     * @param {Object} tickerRepository
     * @param {Object} optionRepository
     * @param {Object} alphaVantageService
     */
    constructor(tickerRepository, optionRepository, alphaVantageService) {
        this.tickerRepository = tickerRepository;
        this.optionRepository = optionRepository;
        this.alphaVantageService = alphaVantageService;
    }

    /**
     * Führt den intraday Options-Späher aus.
     * Holt stündlich die aktuellen Ratios aus der AlphaVantage Kette.
     */
    async runIntraSync() {
        console.log('[OPTIONS-INTRA] Starte stündlichen Options-Ratio Scan für STOCK Assets...');

        const tickers = await this.tickerRepository.getTickersForJob(SYNC_JOBS.OPTIONS);
        if (!tickers || tickers.length === 0) {
            console.warn('[OPTIONS-INTRA] Keine Ticker für OPTIONS registriert. Breche ab.');
            return;
        }

        for (const tickerRow of tickers) {
            const tickerId = tickerRow.id;
            const symbolUpper = tickerRow.name.toUpperCase();

            console.log(`\n[OPTIONS-INTRA] Scanne Ticker: ${symbolUpper} (ID: ${tickerId})`);

            try {
                const records = await this.alphaVantageService.fetchIntradayRatios(symbolUpper);
                if (!records || records.length === 0) continue;

                // Direktes, relationales Wegschreiben in option_chain_snapshots
                await this.optionRepository.insertAlphaVantageRatios(tickerId, records);
                console.log(`[OPTIONS-INTRA] ${records.length} Kontrakte für ${symbolUpper} verarbeitet.`);

            } catch (tickerError) {
                console.error(`[OPTIONS-INTRA ERROR] Fehler bei Ticker ${symbolUpper}:`, tickerError.message);
            }
        }
        console.log('\n[OPTIONS-INTRA] Stündlicher Scan beendet.');
    }

    /**
     * Historischer Options-Scharfschütze mit automatischer Lücken-Erkennung (Gap-Filler)
     * Findet alle historischen Anomalien und füllt fehlende 15-Minuten-Intervalle.
     * @param {Object} polygonService 
     */
    async runHistoricSync(polygonService) {
        console.log('[OPTIONS-HISTORIC] Starte resilienten EOD-Lauf mit Gap-Filler...');

        const todayStr = new Date().toISOString().split('T')[0];

        console.log('[OPTIONS-HISTORIC] Extrahiere alle jemals registrierten Volumen-Ausreißer...');

        const anomalies = await this.optionRepository.getAnomalousContracts();

        if (!anomalies || anomalies.length === 0) {
            console.log('[OPTIONS-HISTORIC] Keine historischen Volumen-Ausreißer in option_chain_snapshots gefunden. Warte auf Intraday-Signale.');
            return;
        }

        const uniqueAnomalies = [];
        const seenContracts = new Set();
        for (const item of anomalies) {
            if (!seenContracts.has(item.contract_id)) {
                seenContracts.add(item.contract_id);
                uniqueAnomalies.push(item);
            }
        }

        console.log(`[OPTIONS-HISTORIC] ${uniqueAnomalies.length} einzigartige Kontrakte müssen überprüft werden.`);

        for (const anomaly of uniqueAnomalies) {
            const tickerId = anomaly.ticker;
            const contractId = anomaly.contract_id;

            console.log(`\n[OPTIONS-HISTORIC] Analysiere Daten-Integrität für: ${contractId}`);

            let fromStr;
            try {
                const latestBarTimestamp = await this.optionRepository.getLatestBarTimestampForContract(contractId);

                if (latestBarTimestamp) {
                    const latestDate = new Date(latestBarTimestamp);
                    latestDate.setDate(latestDate.getDate() + 1);
                    fromStr = latestDate.toISOString().split('T')[0];
                    console.log(` -> Status: Teilweise vorhanden. Letzter Eintrag vom: ${latestBarTimestamp.split('T')[0]}`);
                } else {
                    const fiveDaysAgo = new Date();
                    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
                    fromStr = fiveDaysAgo.toISOString().split('T')[0];
                    console.log(` -> Status: Keine Bars vorhanden. Initialisiere 5-Tage-Lookback.`);
                }

                if (fromStr > todayStr) {
                    console.log(` -> Integrität gewahrt: Kontrakt ist bereits lückenlos aktuell.`);
                    continue;
                }

                console.log(` -> Lücken-Schluss: Ziehe Daten von [${fromStr}] bis [${todayStr}]`);

                const bars = await polygonService.fetchOptionsContractBars(contractId, 15, 'minute', fromStr, todayStr);

                if (!bars || bars.length === 0) {
                    console.log(` -> Hinweis: Keine neue Handelsaktivität in diesem Zeitraum.`);
                    continue;
                }

                await this.optionRepository.insertHistoricContractBars(tickerId, contractId, bars);
                console.log(` -> SUCCESS: ${bars.length} Intraday-Bars lückenlos nachgetragen.`);

            } catch (err) {
                console.error(` -> [ERROR] Verarbeitung fehlgeschlagen für ${contractId}:`, err.message);
            }
        }

        console.log('\n[OPTIONS-HISTORIC] Alle historischen Gaps erfolgreich geschlossen.');
    }

    /**
     * Autonomer 2-Jahres Options-Backfill
     * Scannt die Datenbank nach getriggerten Ausreißer-Kontrakten und füllt deren
     * 15-Minuten-Historie vollautomatisch bis zur maximalen Lebensdauer (max. 2 Jahre) auf.
     * @param {Object} polygonService 
     */
    async runBackfillSync(polygonService) {
        console.log('[OPTIONS-BACKFILL] Starte autonomen 2-Jahres-Backfill...');

        const today = new Date();
        const twoYearsAgo = new Date();
        twoYearsAgo.setFullYear(today.getFullYear() - 2);
        
        const targetBackfillStr = twoYearsAgo.toISOString().split('T')[0];
        const todayStr = today.toISOString().split('T')[0];

        console.log(`[OPTIONS-BACKFILL] Maximales historisches Ziel: Rückwirkend bis ${targetBackfillStr}`);
        console.log('[OPTIONS-BACKFILL] Lade dynamische Watchlist aus der Datenbank...');

        const anomalies = await this.optionRepository.getAnomalousContracts();

        if (!anomalies || anomalies.length === 0) {
            console.log('[OPTIONS-BACKFILL] Keine Ausreißer in der Datenbank gefunden. Die Watchlist ist leer.');
            return;
        }

        const uniqueTargets = [];
        const seenContracts = new Set();
        for (const item of anomalies) {
            if (!seenContracts.has(item.contract_id)) {
                seenContracts.add(item.contract_id);
                uniqueTargets.push(item);
            }
        }

        console.log(`[OPTIONS-BACKFILL] ${uniqueTargets.length} relevante Kontrakte für die historische Tiefenbohrung identifiziert.`);

        for (const target of uniqueTargets) {
            const tickerId = target.ticker;
            const contractId = target.contract_id;

            console.log(`\n[OPTIONS-BACKFILL] Analysiere Historien-Tiefe für: ${contractId}`);

            let fromStr = targetBackfillStr;
            let toStr = todayStr;

            try {
                const oldestBarTimestamp = await this.optionRepository.getOldestBarTimestampForContract(contractId);

                if (oldestBarTimestamp) {
                    const oldestDate = new Date(oldestBarTimestamp);
                    const toDateObj = new Date(oldestDate.getTime() - 24 * 60 * 60 * 1000);
                    toStr = toDateObj.toISOString().split('T')[0];

                    console.log(` -> Status: Teil-Historie vorhanden. Ältester Record vom: ${oldestBarTimestamp.split('T')[0]}`);

                    if (toStr < targetBackfillStr) {
                        console.log(` -> Ziel erreicht: Kontrakt hat bereits die vollen 2 Jahre Historie.`);
                        continue;
                    }
                } else {
                    console.log(` -> Status: Keine Bars vorhanden. Starte vollen historischen Download.`);
                }

                console.log(` -> Fordere Datenblock an: [${fromStr}] bis [${toStr}]`);

                const bars = await polygonService.fetchOptionsContractBars(contractId, 15, 'minute', fromStr, toStr);

                if (!bars || bars.length === 0) {
                    console.log(` -> Hinweis: Keine Handelsaktivität für diesen Kontrakt vor dem ${toStr}. (Kontrakt existierte wahrscheinlich noch nicht)`);
                    continue;
                }

                await this.optionRepository.insertHistoricContractBars(tickerId, contractId, bars);
                console.log(` -> SUCCESS: ${bars.length} historische Bars erfolgreich in die Zeitmaschine geladen.`);

            } catch (err) {
                console.error(` -> [ERROR] Abfrage fehlgeschlagen für ${contractId}:`, err.message);
            }
        }

        console.log('\n[OPTIONS-BACKFILL] Autonomer 2-Jahres-Backfill vollständig abgeschlossen.');
    }
}
