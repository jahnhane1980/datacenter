import { SYNC_JOBS } from '../repositories/TickerRepository.js';
import { DateHelper } from '../core/DateHelper.js';
import { BaseController } from '../core/BaseController.js';

export class M5Controller extends BaseController {
    /**
     * @param {Object} tickerRepository
     * @param {Object} candleRepository
     * @param {Object} polygonIoService
     */
    constructor(tickerRepository, candleRepository, polygonIoService) {
        super('M5Controller');
        this.tickerRepository = tickerRepository;
        this.candleRepository = candleRepository;
        this.polygonIoService = polygonIoService;
    }

    /**
     * Führt den M5-Kerzen-Sync für alle relevanten Ticker aus.
     * @param {boolean} isMarketOpen Gibt an, ob der Markt gerade geöffnet ist.
     */
    async runSync(isMarketOpen = true) {
        await this.executeJob('M5 Kerzen Sync', async () => {
            const tickers = await this.tickerRepository.getTickersForJob(SYNC_JOBS.M5);
            
            if (!tickers || tickers.length === 0) {
                console.log('Keine Aktien (Typ 3) in der Datenbank gefunden.');
                return;
            }

            await this.processItemsSafely(tickers, (t) => t.name, async (ticker) => {
                console.log(`\nVerarbeite M5 für ${ticker.name}...`);
                
                let latestTimestamp = await this.candleRepository.getLatestM5Timestamp(ticker.id);
                const archivedUntil = await this.candleRepository.getArchivedUntilTimestamp(ticker.id);

                // Falls die Datenbank leer geräumt wurde, aber das Archiv-Log existiert, 
                // nehmen wir das Archiv-Datum als Ausgangspunkt für den Sync
                if (archivedUntil && (!latestTimestamp || archivedUntil > latestTimestamp)) {
                    latestTimestamp = archivedUntil;
                }
                const { fromDateStr, toDateStr, isBackfill, isUpToDate } = DateHelper.getSyncRange(latestTimestamp, { offsetSeconds: 300 });

                if (isBackfill && latestTimestamp) {
                    console.log(`[${ticker.name}] Lücke von > 48h erkannt. Aktiviere Backfill-Modus.`);
                }

                if (!isBackfill && !isMarketOpen) {
                    console.log(`[${ticker.name}] Routine-Sync pausiert: Markt ist geschlossen und DB ist aktuell.`);
                    return;
                }

                if (isUpToDate) {
                    console.log(`[${ticker.name}] Ist bereits auf dem neuesten Stand.`);
                    return;
                }

                console.log(`[${ticker.name}] Hole Daten ab ${fromDateStr}...`);

                await this.polygonIoService.fetchHistoricalData(
                    ticker.name, 5, 'minute', fromDateStr, toDateStr,
                    async (chunk) => {
                        await this.candleRepository.upsertM5Candles(ticker.id, chunk);
                    }
                );
            });
        });
    }
}
