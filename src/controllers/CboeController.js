import { SYNC_JOBS } from '../repositories/TickerRepository.js';

export class CboeController {
    /**
     * @param {Object} tickerRepo 
     * @param {Object} cboeRepo 
     * @param {Object} cboeService 
     * @param {Object} pacingManager 
     */
    constructor(tickerRepo, cboeRepo, cboeService, pacingManager) {
        this.tickerRepo = tickerRepo;
        this.cboeRepo = cboeRepo;
        this.cboeService = cboeService;
        this.pacingManager = pacingManager;
    }

    async runSync() {
        console.log('=== Starte CBOE Options Volume Sync ===');

        const tickers = await this.tickerRepo.getTickersForJob(SYNC_JOBS.OPTIONS);
        if (!tickers || tickers.length === 0) {
            console.log('Keine Ticker für OPTIONS konfiguriert.');
            return;
        }

        const today = new Date();
        const toDateStr = today.toISOString().split('T')[0];

        for (const ticker of tickers) {
            console.log(`\nVerarbeite CBOE-Volumen für ${ticker.name}...`);

            try {
                const latestTimestamp = await this.cboeRepo.getLatestTimestamp(ticker.id);
                let fromDateStr;

                if (!latestTimestamp) {
                    console.log(`[${ticker.name}] Keine historischen CBOE-Daten gefunden. Starte 2-Jahres-Backfill.`);
                    const backfillDate = new Date();
                    backfillDate.setFullYear(today.getFullYear() - 2);
                    fromDateStr = backfillDate.toISOString().split('T')[0];
                } else {
                    const nextDate = new Date((latestTimestamp + 86400) * 1000);
                    if (nextDate > today) {
                        console.log(`[${ticker.name}] Daten-Integrität geprüft: DB ist lückenlos aktuell. Überspringe API-Abfrage.`);
                        continue;
                    }
                    fromDateStr = nextDate.toISOString().split('T')[0];
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

                await this._humanSleep(8, 15);

            } catch (error) {
                console.error(`Fehler bei Ticker ${ticker.name}: ${error.message}`);
                await this._humanSleep(5, 10);
            }
        }

        console.log('\n=== CBOE Options Volume Sync abgeschlossen ===');
    }
}
