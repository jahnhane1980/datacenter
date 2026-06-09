import { FRED_SERIES } from '../services/FredService.js';

export class FredController {
    /**
     * @param {Object} fredRepo 
     * @param {Object} fredService 
     * @param {Object} pacingManager
     */
    constructor(fredRepo, fredService, pacingManager) {
        this.fredRepo = fredRepo;
        this.fredService = fredService;
        this.pacingManager = pacingManager;
    }

    /**
     * Kern-Logik für den FRED-Datenabruf und Upsert
     * @param {string} startDate - Datum im Format 'YYYY-MM-DD'
     */
    async _executeSync(startDate) {
        console.log(`Hole Daten ab: ${startDate}...`);

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
                        demand_deposits: null
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

        console.log('Lade Makro-Definitionen für das ID-Mapping...');
        const definitions = await this.fredRepository.getMacroIndicatorDefinitions();
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
            demand_deposits: FRED_SERIES.DEMAND_DEPOSITS
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
                values.demand_deposits === null
            ) {
                skippedCount++;
                continue;
            }

            try {
                // Legacy Upsert
                await this.fredRepository.upsertMacroData(
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
                    await this.fredRepository.upsertMacroIndicatorValues(newIndicatorValues);
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
        console.log('Starte täglichen FRED Macro Liquidity Sync...');
        
        let startDate;
        const latestDate = await this.fredRepository.getLatestObservationDate();

        if (latestDate) {
            startDate = latestDate;
            console.log(`Letzter Datenbankeintrag gefunden: ${latestDate}. Hole Delta bis heute...`);
        } else {
            const date = new Date();
            date.setDate(date.getDate() - 14);
            startDate = date.toISOString().split('T')[0];
            console.log(`Kein Eintrag gefunden. Fallback auf die letzten 14 Tage (ab ${startDate})...`);
        }

        await this._executeSync(startDate);
        console.log('Daily Sync erfolgreich beendet!');
    }

    /**
     * Führt einen kompletten historischen Backfill aus.
     */
    async runBackfill() {
        console.log('Starte FRED Macro Liquidity Backfill...');
        
        const latestDate = await this.fredRepository.getLatestObservationDate();
        
        // Nach dem initialen Lauf kann startDate hier dynamisch angepasst werden
        const startDate = '2021-01-01';

        console.log(`Letzter Datenbankeintrag: ${latestDate || 'Keiner gefunden'}.`);
        await this._executeSync(startDate);
        console.log('Backfill erfolgreich beendet!');
    }
}
