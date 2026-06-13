import { FRED_SERIES } from '../services/FredService.js';
import { DateHelper } from '../core/DateHelper.js';
import { BaseController } from '../core/BaseController.js';

export class FredController extends BaseController {
    /**
     * @param {Object} fredRepo 
     * @param {Object} fredService 
     * @param {Object} pacingManager
     */
    constructor(fredRepo, fredService, pacingManager) {
        super('FredController', pacingManager);
        this.fredRepo = fredRepo;
        this.fredService = fredService;
        this.pacingManager = pacingManager;
    }

    /**
     * Kern-Logik für den FRED-Datenabruf und Upsert
     * @param {string} startDate - Datum im Format 'YYYY-MM-DD'
     */
    async _executeSync(startDate, latestDate = null) {
        console.log(`Hole Daten ab: ${startDate}...`);

        const { EventBus } = await import('../core/EventBus.js').catch(() => ({ EventBus: null }));

        const tgaData = await this.fredService.fetchObservations(FRED_SERIES.TGA_BALANCE, startDate);
        await this.pacingManager.sleepMs(1000);
        const rrpData = await this.fredService.fetchObservations(FRED_SERIES.REVERSE_REPO, startDate);
        await this.pacingManager.sleepMs(1000);
        const fedData = await this.fredService.fetchObservations(FRED_SERIES.FED_BALANCE_SHEET, startDate);
        await this.pacingManager.sleepMs(1000);
        const btfpData = await this.fredService.fetchObservations(FRED_SERIES.BANK_TERM_FUNDING_PROGRAM, startDate);
        await this.pacingManager.sleepMs(1000);
        const bankReservesData = await this.fredService.fetchObservations(FRED_SERIES.BANK_RESERVES_FED_WEEKLY, startDate);
        await this.pacingManager.sleepMs(1000);
        const sofrData = await this.fredService.fetchObservations(FRED_SERIES.SECURED_OVERNIGHT_FINANCING_RATE, startDate);
        await this.pacingManager.sleepMs(1000);
        const depositsAllData = await this.fredService.fetchObservations(FRED_SERIES.DEPOSITS_ALL, startDate);
        await this.pacingManager.sleepMs(1000);
        const demandDepositsData = await this.fredService.fetchObservations(FRED_SERIES.DEMAND_DEPOSITS, startDate);
        await this.pacingManager.sleepMs(1000);
        const spreadData = await this.fredService.fetchObservations(FRED_SERIES.YIELD_SPREAD_10Y2Y, startDate);

        console.log('Daten erfolgreich geladen. Führe Merge nach Datum durch...');

        const mergedDataByDate = new Map();

        const processSeries = (observations, fieldName) => {
            if (!observations) return;
            for (const obs of observations) {
                const date = obs.date;
                if (!mergedDataByDate.has(date)) {
                    mergedDataByDate.set(date, {
                        tga_balance: null,
                        rrp_balance: null,
                        fed_balance: null,
                        btfp_balance: null,
                        bank_reserves_fed: null,
                        sofr_rate: null,
                        deposits_all: null,
                        demand_deposits: null,
                        yield_spread_10y2y: null
                    });
                }
                
                const value = obs.value !== '.' ? parseFloat(obs.value) : null;
                mergedDataByDate.get(date)[fieldName] = value;
            }
        };

        processSeries(tgaData, 'tga_balance');
        processSeries(rrpData, 'rrp_balance');
        processSeries(fedData, 'fed_balance');
        processSeries(btfpData, 'btfp_balance');
        processSeries(bankReservesData, 'bank_reserves_fed');
        processSeries(sofrData, 'sofr_rate');
        processSeries(depositsAllData, 'deposits_all');
        processSeries(demandDepositsData, 'demand_deposits');
        processSeries(spreadData, 'yield_spread_10y2y');

        console.log('Lade Makro-Definitionen für das ID-Mapping...');
        const definitions = await this.fredRepo.getMacroIndicatorDefinitions();
        const definitionMap = {};
        for (const def of definitions) {
            definitionMap[def.series_id] = def.id;
        }

        const fieldToSeriesMap = {
            tga_balance: FRED_SERIES.TGA_BALANCE,
            rrp_balance: FRED_SERIES.REVERSE_REPO,
            fed_balance: FRED_SERIES.FED_BALANCE_SHEET,
            btfp_balance: FRED_SERIES.BANK_TERM_FUNDING_PROGRAM,
            bank_reserves_fed: FRED_SERIES.BANK_RESERVES_FED_WEEKLY,
            sofr_rate: FRED_SERIES.SECURED_OVERNIGHT_FINANCING_RATE,
            deposits_all: FRED_SERIES.DEPOSITS_ALL,
            demand_deposits: FRED_SERIES.DEMAND_DEPOSITS,
            yield_spread_10y2y: FRED_SERIES.YIELD_SPREAD_10Y2Y
        };

        console.log(`Starte Filterung und Upsert für ${mergedDataByDate.size} erfasste Tage...`);

        let successCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        for (const [date, values] of mergedDataByDate.entries()) {
            if (
                values.tga_balance === null &&
                values.rrp_balance === null &&
                values.fed_balance === null &&
                values.btfp_balance === null &&
                values.bank_reserves_fed === null &&
                values.sofr_rate === null &&
                values.deposits_all === null &&
                values.demand_deposits === null &&
                values.yield_spread_10y2y === null
            ) {
                skippedCount++;
                continue;
            }

            try {
                // Legacy Upsert
                await this.fredRepo.upsertMacroData(
                    date,
                    values.tga_balance,
                    values.rrp_balance,
                    values.fed_balance,
                    values.btfp_balance,
                    values.bank_reserves_fed,
                    values.sofr_rate
                );

                // Normalisierter Upsert
                const newIndicatorValues = [];
                for (const [fieldName, seriesId] of Object.entries(fieldToSeriesMap)) {
                    const value = values[fieldName];
                    const indicatorId = definitionMap[seriesId];

                    if (value !== null && indicatorId !== undefined) {
                        newIndicatorValues.push({
                            indicator_id: indicatorId,
                            observation_date: date,
                            value: value
                        });
                    }
                }

                if (newIndicatorValues.length > 0) {
                    await this.fredRepo.upsertMacroIndicatorValues(newIndicatorValues);
                }

                if (EventBus && latestDate && new Date(date) > new Date(latestDate)) {
                    EventBus.emit('FredController', 'liquidity_update', {
                        date: date,
                        tga: values.tga_balance,
                        rrp: values.rrp_balance,
                        fed: values.fed_balance,
                        sofr: values.sofr_rate
                    });

                    if (values.yield_spread_10y2y !== null) {
                        EventBus.emit('FredController', 'yield_curve_update', {
                            date: date,
                            spread: values.yield_spread_10y2y
                        });
                    }
                }

                successCount++;
            } catch (err) {
                console.error(`Fehler beim Upsert für das Datum ${date}:`, err.message);
                errorCount++;
            }
        }

        console.log(`Erfolgreiche Inserts/Updates: ${successCount}`);
        console.log(`Übersprungene leere Tage: ${skippedCount}`);
        console.log(`Fehlgeschlagene Inserts: ${errorCount}`);
    }

    /**
     * Führt den täglichen Delta-Sync aus.
     */
    async runDailySync() {
        await this.executeJob('FRED Macro Liquidity Sync (Daily)', async () => {
            let startDate;
            const latestDate = await this.fredRepo.getLatestObservationDate();

            if (latestDate) {
                startDate = latestDate;
                console.log(`Letzter Datenbankeintrag gefunden: ${latestDate}. Hole Delta bis heute...`);
            } else {
                const date = new Date();
                date.setDate(date.getDate() - 14);
                startDate = DateHelper.toSqlDate(date);
                console.log(`Kein Eintrag gefunden. Fallback auf die letzten 14 Tage (ab ${startDate})...`);
            }

            await this._executeSync(startDate, latestDate);
        });
    }

    /**
     * Führt einen kompletten historischen Backfill aus.
     */
    async runBackfill() {
        await this.executeJob('FRED Macro Liquidity Backfill', async () => {
            const latestDate = await this.fredRepo.getLatestObservationDate();
            
            // Nach dem initialen Lauf kann startDate hier dynamisch angepasst werden
            const startDate = '2021-01-01';

            console.log(`Letzter Datenbankeintrag: ${latestDate || 'Keiner gefunden'}.`);
            await this._executeSync(startDate);
        });
    }
}
