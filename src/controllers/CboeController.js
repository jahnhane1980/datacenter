import { SYNC_JOBS } from '../repositories/TickerRepository.js';
import { DateHelper } from '../core/DateHelper.js';
import { BaseController } from '../core/BaseController.js';

export class CboeController extends BaseController {
    /**
     * @param {Object} tickerRepo 
     * @param {Object} cboeRepo 
     * @param {Object} cboeService 
     * @param {Object} pacingManager 
     */
    constructor(tickerRepo, cboeRepo, cboeService, pacingManager) {
        super('CboeController', pacingManager);
        this.tickerRepo = tickerRepo;
        this.cboeRepo = cboeRepo;
        this.cboeService = cboeService;
        this.pacingManager = pacingManager;
    }

    async runSync() {
        await this.executeJob('CBOE Options Volume Sync', async () => {
            const tickers = await this.tickerRepo.getTickersForJob(SYNC_JOBS.OPTIONS);
            if (!tickers || tickers.length === 0) {
                console.log('Keine Ticker für OPTIONS konfiguriert.');
                return;
            }

            await this.processItemsSafely(tickers, (t) => t.name, async (ticker) => {
                console.log(`\nVerarbeite CBOE-Volumen für ${ticker.name}...`);

                const latestTimestamp = await this.cboeRepo.getLatestTimestamp(ticker.id);
                const { fromDateStr, toDateStr, isBackfill, isUpToDate } = DateHelper.getSyncRange(latestTimestamp);

                if (isUpToDate) {
                    console.log(`[${ticker.name}] Daten-Integrität geprüft: DB ist lückenlos aktuell. Überspringe API-Abfrage.`);
                    return;
                }

                if (isBackfill && !latestTimestamp) {
                    console.log(`[${ticker.name}] Keine historischen CBOE-Daten gefunden. Starte 2-Jahres-Backfill.`);
                }

                const records = await this.cboeService.fetchOptionsVolume(ticker.name, fromDateStr, toDateStr);

                let addedRecords = 0;
                for (const record of records) {
                    const dateParts = record['Trade Date'].split('/');
                    if (dateParts.length === 3) {
                        const dateUtc = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2]));
                        const timestampSeconds = Math.floor(dateUtc.getTime() / 1000);
                        const volume = parseInt(record['Volume'], 10);

                        if (!isNaN(volume)) {
                            await this.cboeRepo.upsertVolumeData(ticker.id, timestampSeconds, volume);
                            addedRecords++;
                        }
                    }
                }

                console.log(`[${ticker.name}] ${addedRecords} CBOE-Datensätze erfolgreich verarbeitet.`);
                await this.delay(8, 15);
            });
        });
    }
}
