import { SYNC_JOBS } from '../repositories/TickerRepository.js';
import { DateHelper } from '../core/DateHelper.js';
import { BaseController } from '../core/BaseController.js';

export class OptionsController extends BaseController {
    /**
     * @param {Object} tickerRepository
     * @param {Object} optionRepository
     * @param {Object} alphaVantageService
     */
    constructor(tickerRepository, optionRepository, alphaVantageService, pacingManager = null) {
        super('OptionsController', pacingManager);
        this.tickerRepository = tickerRepository;
        this.optionRepository = optionRepository;
        this.alphaVantageService = alphaVantageService;
    }

    /**
     * Führt den intraday Options-Späher aus.
     * Holt stündlich die aktuellen Ratios aus der AlphaVantage Kette.
     */
    async runIntraSync() {
        await this.executeJob('OPTIONS-INTRA', async () => {
            const tickers = await this.tickerRepository.getTickersForJob(SYNC_JOBS.OPTIONS);
            if (!tickers || tickers.length === 0) {
                console.warn('[OPTIONS-INTRA] Keine Ticker für OPTIONS registriert. Breche ab.');
                return;
            }

            await this.processItemsSafely(tickers, (t) => t.name.toUpperCase(), async (tickerRow) => {
                const tickerId = tickerRow.id;
                const symbolUpper = tickerRow.name.toUpperCase();

                console.log(`\n[OPTIONS-INTRA] Scanne Ticker: ${symbolUpper} (ID: ${tickerId})`);

                const records = await this.alphaVantageService.fetchIntradayRatios(symbolUpper);
                if (!records || records.length === 0) return;

                // Direktes, relationales Wegschreiben in option_chain_snapshots
                await this.optionRepository.insertAlphaVantageRatios(tickerId, records);
                console.log(`[OPTIONS-INTRA] ${records.length} Kontrakte für ${symbolUpper} verarbeitet.`);
            });
            
            console.log('\n[OPTIONS-INTRA] Stündlicher Scan beendet.');
        });
    }

    /**
     * Historischer Options-Scharfschütze mit automatischer Lücken-Erkennung (Gap-Filler)
     * Findet alle historischen Anomalien und füllt fehlende 15-Minuten-Intervalle.
     * @param {Object} polygonService 
     */
    async runHistoricSync(polygonService) {
        await this.executeJob('OPTIONS-HISTORIC', async () => {
            const todayStr = DateHelper.toSqlDate();

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

            await this.processItemsSafely(uniqueAnomalies, (a) => a.contract_id, async (anomaly) => {
                const tickerId = anomaly.ticker;
                const contractId = anomaly.contract_id;

                console.log(`\n[OPTIONS-HISTORIC] Analysiere Daten-Integrität für: ${contractId}`);

                let fromStr;
                const latestBarTimestamp = await this.optionRepository.getLatestBarTimestampForContract(contractId);

                if (latestBarTimestamp) {
                    const latestDate = new Date(latestBarTimestamp);
                    latestDate.setDate(latestDate.getDate() + 1);
                    fromStr = DateHelper.toSqlDate(latestDate);
                    console.log(` -> Status: Teilweise vorhanden. Letzter Eintrag vom: ${latestBarTimestamp.split('T')[0]}`);
                } else {
                    const fiveDaysAgo = new Date();
                    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
                    fromStr = DateHelper.toSqlDate(fiveDaysAgo);
                    console.log(` -> Status: Keine Bars vorhanden. Initialisiere 5-Tage-Lookback.`);
                }

                if (fromStr > todayStr) {
                    console.log(` -> Integrität gewahrt: Kontrakt ist bereits lückenlos aktuell.`);
                    return;
                }

                console.log(` -> Lücken-Schluss: Ziehe Daten von [${fromStr}] bis [${todayStr}]`);

                const bars = await polygonService.fetchOptionsContractBars(contractId, 15, 'minute', fromStr, todayStr);

                if (!bars || bars.length === 0) {
                    console.log(` -> Hinweis: Keine neue Handelsaktivität in diesem Zeitraum.`);
                    return;
                }

                await this.optionRepository.insertHistoricContractBars(tickerId, contractId, bars);
                console.log(` -> SUCCESS: ${bars.length} Intraday-Bars lückenlos nachgetragen.`);
            });

            console.log('\n[OPTIONS-HISTORIC] Alle historischen Gaps erfolgreich geschlossen.');
        });
    }

    /**
     * Autonomer 2-Jahres Options-Backfill
     * Scannt die Datenbank nach getriggerten Ausreißer-Kontrakten und füllt deren
     * 15-Minuten-Historie vollautomatisch bis zur maximalen Lebensdauer (max. 2 Jahre) auf.
     * @param {Object} polygonService 
     */
    async runBackfillSync(polygonService) {
        await this.executeJob('OPTIONS-BACKFILL', async () => {
            const targetBackfillStr = DateHelper.toSqlDate(DateHelper.getYearsAgo(2));
            const todayStr = DateHelper.toSqlDate();

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

            await this.processItemsSafely(uniqueTargets, (t) => t.contract_id, async (target) => {
                const tickerId = target.ticker;
                const contractId = target.contract_id;

                console.log(`\n[OPTIONS-BACKFILL] Analysiere Historien-Tiefe für: ${contractId}`);

                let fromStr = targetBackfillStr;
                let toStr = todayStr;

                const oldestBarTimestamp = await this.optionRepository.getOldestBarTimestampForContract(contractId);

                if (oldestBarTimestamp) {
                    const oldestDate = new Date(oldestBarTimestamp);
                    const toDateObj = new Date(oldestDate.getTime() - 24 * 60 * 60 * 1000);
                    toStr = DateHelper.toSqlDate(toDateObj);

                    console.log(` -> Status: Teil-Historie vorhanden. Ältester Record vom: ${oldestBarTimestamp.split('T')[0]}`);

                    if (toStr < targetBackfillStr) {
                        console.log(` -> Ziel erreicht: Kontrakt hat bereits die vollen 2 Jahre Historie.`);
                        return;
                    }
                } else {
                    console.log(` -> Status: Keine Bars vorhanden. Starte vollen historischen Download.`);
                }

                console.log(` -> Fordere Datenblock an: [${fromStr}] bis [${toStr}]`);

                const bars = await polygonService.fetchOptionsContractBars(contractId, 15, 'minute', fromStr, toStr);

                if (!bars || bars.length === 0) {
                    console.log(` -> Hinweis: Keine Handelsaktivität für diesen Kontrakt vor dem ${toStr}. (Kontrakt existierte wahrscheinlich noch nicht)`);
                    return;
                }

                await this.optionRepository.insertHistoricContractBars(tickerId, contractId, bars);
                console.log(` -> SUCCESS: ${bars.length} historische Bars erfolgreich in die Zeitmaschine geladen.`);
            });

            console.log('\n[OPTIONS-BACKFILL] Autonomer 2-Jahres-Backfill vollständig abgeschlossen.');
        });
    }
}
