import { BaseController } from '../core/BaseController.js';
import { SellingClimaxScorer } from '../core/analysis/SellingClimaxScorer.js';
import { EventBus } from '../core/EventBus.js';

export class ClimaxController extends BaseController {
    /**
     * @param {Object} tickerRepository
     * @param {Object} supabaseClient - Für direkte historische Bulk-Abfragen zur Performance-Optimierung
     */
    constructor(tickerRepository, supabaseClient) {
        super('ClimaxController');
        this.tickerRepository = tickerRepository;
        this.supabase = supabaseClient;
    }

    /**
     * Scannt alle konfigurierten Ticker auf einen Selling Climax.
     * Sollte am Ende des Handelstages (nach Daily, CBOE und FINRA Sync) laufen.
     */
    async runScan() {
        await this.executeJob('Selling Climax Scan', async () => {
            const tickers = await this.tickerRepository.getAllTickers();
            
            if (!tickers || tickers.length === 0) {
                console.log('Keine Ticker gefunden.');
                return;
            }

            const now = new Date();
            const endTs = Math.floor(now.getTime() / 1000);
            // Wir brauchen mind. 30 Handelstage für den SMA, also ca. 45 Kalendertage zurück
            const histStartTs = Math.floor(new Date(now.setDate(now.getDate() - 45)).getTime() / 1000);

            await this.processItemsSafely(tickers, (t) => t.name, async (ticker) => {
                
                // 1. Daily Candles
                const { data: candles, error: candleError } = await this.supabase
                    .from('market_daily_candles')
                    .select('timestamp, open, high, low, close, volume')
                    .eq('ticker', ticker.id)
                    .gte('timestamp', histStartTs)
                    .lte('timestamp', endTs)
                    .order('timestamp', { ascending: true });

                if (candleError) throw new Error(`[ClimaxController] DB Fehler Candles: ${candleError.message}`);
                if (!candles || candles.length < 21) return;

                // 2. FINRA Shorts
                const { data: finraData, error: finraError } = await this.supabase
                    .from('market_finra_short_volume')
                    .select('timestamp, short_volume, total_volume')
                    .eq('ticker', ticker.id)
                    .gte('timestamp', histStartTs)
                    .lte('timestamp', endTs)
                    .order('timestamp', { ascending: true });

                if (finraError) throw new Error(`[ClimaxController] DB Fehler FINRA: ${finraError.message}`);

                // 3. CBOE Options
                const { data: cboeData, error: cboeError } = await this.supabase
                    .from('option_cboe_volume')
                    .select('timestamp, volume')
                    .eq('ticker', ticker.id)
                    .gte('timestamp', histStartTs)
                    .lte('timestamp', endTs)
                    .order('timestamp', { ascending: true });

                if (cboeError) throw new Error(`[ClimaxController] DB Fehler CBOE: ${cboeError.message}`);

                const shortVolumeRatios = (finraData || []).map(d => d.total_volume > 0 ? d.short_volume / d.total_volume : 0);
                const optionsVolume = (cboeData || []).map(d => d.volume);

                const result = SellingClimaxScorer.calculateScore({
                    candles: candles,
                    shortVolumeRatios: shortVolumeRatios,
                    optionsVolume: optionsVolume
                });

                if (result.isClimax) {
                    console.log(`[${ticker.name}] 🚨 CLIMAX DETECTED! Score: ${result.score}`);
                    EventBus.emit('ClimaxController', 'selling_climax_detected', {
                        ticker: ticker.name,
                        score: result.score,
                        reasons: result.reasons
                    });
                } else {
                    console.log(`[${ticker.name}] Climax Score: ${result.score}/100`);
                }
            });
        });
    }
}
