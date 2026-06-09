import { BaseController } from '../core/BaseController.js';

export class LaborMarketController extends BaseController {
    /**
     * @param {Object} laborMarketRepo 
     * @param {Object} laborMarketService 
     */
    constructor(laborMarketRepo, laborMarketService, pacingManager = null) {
        super('LaborMarketController', pacingManager);
        this.laborMarketRepo = laborMarketRepo;
        this.laborMarketService = laborMarketService;
    }

    async runDailySync() {
        await this.executeJob('Labor Market Sync (Daily Delta)', async () => {
            const seriesList = await this.laborMarketRepo.getSeries();
            let totalSuccess = 0;

            await this.processItemsSafely(seriesList, (s) => s.id, async (series) => {
                const latestDate = await this.laborMarketRepo.getLatestDate(series.id);
                const startDate = latestDate ? latestDate : '2024-01-01';
                
                console.log(`Hole Arbeitsmarktdaten für ${series.id} ab ${startDate}...`);
                const observations = await this.laborMarketService.fetchSeriesData(series.id, startDate);
                
                for (const obs of observations) {
                    if (obs.value !== '.') {
                        await this.laborMarketRepo.upsertDataPoint(
                            series.id, 
                            obs.date, 
                            obs.realtime_start,
                            parseFloat(obs.value), 
                            true // Im Delta-Sync gehen wir von vorläufigen Daten aus
                        );
                        totalSuccess++;
                    }
                }
            });
            console.log(`\n>>> Labor Market Sync abgeschlossen: ${totalSuccess} neue/aktualisierte Datensätze. <<<`);
        });
    }

    async runBackfill() {
        await this.executeJob('Labor Market Backfill (Historischer Import ab 2000)', async () => {
            const backfillStartDate = '2000-01-01'; 
            const seriesList = await this.laborMarketRepo.getSeries();
            let totalSuccess = 0;

            await this.processItemsSafely(seriesList, (s) => s.id, async (series) => {
                console.log(`Hole komplette Historie für ${series.id} ab ${backfillStartDate}...`);
                const observations = await this.laborMarketService.fetchSeriesData(series.id, backfillStartDate);
                
                for (const obs of observations) {
                    if (obs.value !== '.') {
                        await this.laborMarketRepo.upsertDataPoint(
                            series.id, 
                            obs.date, 
                            obs.realtime_start,
                            parseFloat(obs.value), 
                            false // Historische Daten werten wir als finale, revidierte Zahlen (false)
                        );
                        totalSuccess++;
                    }
                }
            });
            console.log(`\n>>> Labor Market Backfill erfolgreich: ${totalSuccess} historische Datensätze geschrieben. <<<`);
        });
    }
}
