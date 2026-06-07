import { supabaseClient } from '../core/SupabaseClient.js';

const DB_TABLE = 'cboe_options_volume';

export class CboeRepository {
    async upsertVolumeData(tickerId, timestamp, volume) {
        const { error } = await supabaseClient
            .from(DB_TABLE)
            .upsert(
                { 
                    ticker: tickerId, 
                    timestamp: timestamp, 
                    volume: volume 
                }, 
                { onConflict: 'ticker,timestamp' }
            );

        if (error) {
            throw new Error(`Fehler beim Upsert in cboe_options_volume: ${error.message}`);
        }
    }

    async getLatestTimestamp(tickerId) {
        const { data, error } = await supabaseClient
            .from(DB_TABLE)
            .select('timestamp')
            .eq('ticker', tickerId)
            .order('timestamp', { ascending: false })
            .limit(1);

        if (error) {
            throw new Error(`Fehler beim Holen des neuesten CBOE-Timestamps: ${error.message}`);
        }

        return data && data.length > 0 ? data[0].timestamp : null;
    }
}