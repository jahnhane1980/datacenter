const FX_TICKERS = [
    { fredId: 'DEXUSEU', pair: 'EURUSD' },
    { fredId: 'DEXJPUS', pair: 'USDJPY' },
    { fredId: 'DEXCHUS', pair: 'USDCNY' }
];

export class GlobalMacroController {
    /**
     * @param {Object} globalRepo 
     * @param {Object} globalService 
     */
    constructor(globalRepo, globalService) {
        this.globalRepo = globalRepo;
        this.globalService = globalService;
    }

    async runDailySync() {
        console.log('Starte Global Macro & FX Sync (Daily)...');

        console.log('\n--- Starte Sync für Zentralbank-Bilanzen ---');
        const definitions = await this.globalRepo.getDefinitions();
        
        let cbSuccess = 0;
        let cbSkipped = 0;

        for (const def of definitions) {
            const latestDate = await this.globalRepo.getLatestGlobalDate(def.id);
            const startDate = latestDate ? latestDate : '2024-01-01';
            
            console.log(`Hole Daten für ${def.series_id} (${def.region}) ab ${startDate}...`);
            const observations = await this.globalService.fetchSeriesData(def.series_id, startDate);
            
            for (const obs of observations) {
                if (obs.value !== '.') {
                    const numericValue = parseFloat(obs.value);
                    await this.globalRepo.upsertGlobalData(def.id, obs.date, numericValue);
                    cbSuccess++;
                } else {
                    cbSkipped++;
                }
            }
        }
        console.log(`Zentralbanken Update: ${cbSuccess} Inserts, ${cbSkipped} leere Feiertage übersprungen.`);

        console.log('\n--- Starte Sync für FX-Wechselkurse ---');
        
        let fxSuccess = 0;
        let fxSkipped = 0;

        for (const fx of FX_TICKERS) {
            const latestDate = await this.globalRepo.getLatestFxDate(fx.pair);
            const startDate = latestDate ? latestDate : '2024-01-01';

            console.log(`Hole Wechselkurse für ${fx.pair} (FRED: ${fx.fredId}) ab ${startDate}...`);
            const observations = await this.globalService.fetchSeriesData(fx.fredId, startDate);
            
            for (const obs of observations) {
                if (obs.value !== '.') {
                    const numericValue = parseFloat(obs.value);
                    await this.globalRepo.upsertFxRate(obs.date, fx.pair, numericValue);
                    fxSuccess++;
                } else {
                    fxSkipped++;
                }
            }
        }
        console.log(`FX Update: ${fxSuccess} Inserts, ${fxSkipped} leere Feiertage übersprungen.`);
        
        console.log('\n>>> Global Macro Sync erfolgreich abgeschlossen! <<<');
    }

    async runBackfill() {
        console.log('Starte Global Macro & FX Backfill (Historischer Import)...');
        
        const backfillStartDate = '2010-01-01'; 
        console.log(`Datenabruf forciert ab: ${backfillStartDate}`);

        console.log('\n--- Starte Backfill für Zentralbank-Bilanzen ---');
        const definitions = await this.globalRepo.getDefinitions();
        
        let cbSuccess = 0;
        let cbSkipped = 0;

        for (const def of definitions) {
            console.log(`Hole Historie für ${def.series_id} (${def.region}) ab ${backfillStartDate}...`);
            const observations = await this.globalService.fetchSeriesData(def.series_id, backfillStartDate);
            
            for (const obs of observations) {
                if (obs.value !== '.') {
                    const numericValue = parseFloat(obs.value);
                    await this.globalRepo.upsertGlobalData(def.id, obs.date, numericValue);
                    cbSuccess++;
                } else {
                    cbSkipped++;
                }
            }
        }
        console.log(`Zentralbanken Backfill: ${cbSuccess} Inserts, ${cbSkipped} leere Feiertage übersprungen.`);

        console.log('\n--- Starte Backfill für FX-Wechselkurse ---');
        
        let fxSuccess = 0;
        let fxSkipped = 0;

        for (const fx of FX_TICKERS) {
            console.log(`Hole Historie für ${fx.pair} (FRED: ${fx.fredId}) ab ${backfillStartDate}...`);
            const observations = await this.globalService.fetchSeriesData(fx.fredId, backfillStartDate);
            
            for (const obs of observations) {
                if (obs.value !== '.') {
                    const numericValue = parseFloat(obs.value);
                    await this.globalRepo.upsertFxRate(obs.date, fx.pair, numericValue);
                    fxSuccess++;
                } else {
                    fxSkipped++;
                }
            }
        }
        console.log(`FX Backfill: ${fxSuccess} Inserts, ${fxSkipped} leere Feiertage übersprungen.`);
        
        console.log('\n>>> Global Macro Backfill erfolgreich abgeschlossen! <<<');
    }
}
