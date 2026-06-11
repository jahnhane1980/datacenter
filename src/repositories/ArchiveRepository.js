import { archiveSupabaseClient } from '../core/ArchiveSupabaseClient.js';

export class ArchiveRepository {
    async upsertM5Candles(candles) {
        if (!candles || candles.length === 0) return 0;

        const { error } = await archiveSupabaseClient
            .from('market_m5_candles')
            .upsert(candles);

        if (error) {
            throw new Error(`Fehler beim Schreiben in die Archiv-Datenbank: ${error.message}`);
        }

        return candles.length;
    }
}
