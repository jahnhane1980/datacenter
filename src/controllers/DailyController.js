import { SYNC_JOBS } from '../repositories/TickerRepository.js';
import { DateHelper } from '../core/DateHelper.js';
import { BaseController } from '../core/BaseController.js';

export class DailyController extends BaseController {
    /**
     * @param {Object} tickerRepository
     * @param {Object} candleRepository
     * @param {Object} polygonIoService
     */
    constructor(tickerRepository, candleRepository, polygonIoService) {
        super('DailyController');
        this.tickerRepository = tickerRepository;
        this.candleRepository = candleRepository;
        this.polygonIoService = polygonIoService;
    }

    /**
     * Führt den Daily-Kerzen-Sync für alle relevanten Ticker aus.
     * @param {boolean} isMarketOpen Gibt an, ob der Markt gerade geöffnet ist.
     */
    async runSync(isMarketOpen = true) {
        await this.executeJob('Daily Kerzen Sync', async () => {
            const tickers = await this.tickerRepository.getTickersForJob(SYNC_JOBS.DAILY);
            
            if (!tickers || tickers.length === 0) {
                console.log('Keine relevanten Ticker (Aktien/ETFs) in der Datenbank gefunden.');
                return;
            }

            await this.processItemsSafely(tickers, (t) => t.name, async (ticker) => {
                console.log(`\nVerarbeite Daily für ${ticker.name} (Typ: ${ticker.ticker_typ_id})...`);
                
                const latestTimestamp = await this.candleRepository.getLatestDailyTimestamp(ticker.id);
                const { fromDateStr, toDateStr, isBackfill, isUpToDate } = DateHelper.getSyncRange(latestTimestamp);

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

                console.log(`[${ticker.name}] Hole Daten von ${fromDateStr} bis ${toDateStr}...`);
                
                await this.polygonIoService.fetchHistoricalData(
                    ticker.name, 1, 'day', fromDateStr, toDateStr,
                    async (chunk) => {
                        await this.candleRepository.upsertDailyCandles(ticker.id, chunk);
                    }
                );
            });
        });
    }
}
