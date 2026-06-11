import { BaseController } from '../core/BaseController.js';
import { SYNC_JOBS } from '../repositories/TickerRepository.js';

export class ArchiveController extends BaseController {
    /**
     * @param {Object} tickerRepository
     * @param {Object} archiveRepository
     * @param {Object} supabaseClient
     */
    constructor(tickerRepository, archiveRepository, supabaseClient) {
        super('ArchiveController');
        this.tickerRepository = tickerRepository;
        this.archiveRepository = archiveRepository;
        this.supabaseClient = supabaseClient;
    }

    /**
     * Archiviert M5 Kerzen, die älter als `daysToKeep` sind, in die lokale SQLite-Datenbank.
     * @param {number} daysToKeep Anzahl der Tage, die in Supabase verbleiben sollen (Default 30)
     */
    async runM5Archive(daysToKeep = 30) {
        await this.executeJob('M5 Archive Sync', async () => {
            const tickers = await this.tickerRepository.getTickersForJob(SYNC_JOBS.M5);
            
            if (!tickers || tickers.length === 0) {
                console.log('Keine Aktien (Typ 3) in der Datenbank gefunden.');
                return;
            }

            // Berechne den Cutoff-Timestamp in Unix-Sekunden
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
            const cutoffTimestamp = Math.floor(cutoffDate.getTime() / 1000);

            console.log(`Starte Archivierung für Daten vor dem ${cutoffDate.toISOString()} (Timestamp: ${cutoffTimestamp})`);

            await this.processItemsSafely(tickers, (t) => t.name, async (ticker) => {
                console.log(`\nArchiviere M5 für ${ticker.name}...`);

                let totalArchived = 0;
                let hasMore = true;
                let lastTimestamp = 0; // Paginierung via Timestamp

                while (hasMore) {
                    const { data: candles, error } = await this.supabaseClient
                        .from('market_m5_candles')
                        .select('*')
                        .eq('ticker', ticker.id)
                        .lte('timestamp', cutoffTimestamp)
                        .gt('timestamp', lastTimestamp)
                        .order('timestamp', { ascending: true })
                        .limit(1000);

                    if (error) {
                        throw new Error(`Fehler beim Abrufen alter Kerzen: ${error.message}`);
                    }

                    if (!candles || candles.length === 0) {
                        hasMore = false;
                        break;
                    }

                    // Schreibe ins Supabase Archiv
                    const upsertedCount = await this.archiveRepository.upsertM5Candles(candles);
                    totalArchived += upsertedCount;

                    lastTimestamp = candles[candles.length - 1].timestamp;
                }

                if (totalArchived > 0) {
                    console.log(`[${ticker.name}] ${totalArchived} Kerzen erfolgreich lokal archiviert.`);

                    // 1. Log aktualisieren (Upsert in archive_market_m5_log)
                    const { error: logError } = await this.supabaseClient
                        .from('archive_market_m5_log')
                        .upsert({ 
                            ticker: ticker.id, 
                            archived_until: cutoffTimestamp 
                        }, { onConflict: 'ticker' });

                    if (logError) {
                        throw new Error(`Fehler beim Aktualisieren des Archiv-Logs: ${logError.message}`);
                    }

                    // 2. Aus Supabase löschen
                    const { error: deleteError } = await this.supabaseClient
                        .from('market_m5_candles')
                        .delete()
                        .eq('ticker', ticker.id)
                        .lte('timestamp', cutoffTimestamp);

                    if (deleteError) {
                        throw new Error(`Fehler beim Löschen der alten Kerzen aus Supabase: ${deleteError.message}`);
                    }

                    console.log(`[${ticker.name}] Alte Kerzen aus Supabase gelöscht und Log aktualisiert.`);
                } else {
                    console.log(`[${ticker.name}] Keine alten Daten zum Archivieren gefunden.`);
                }
            });
        });
    }
}
