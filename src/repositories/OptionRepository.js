/**
 * OptionRepository
 * Verwaltet alle Datenbankoperationen für Options-Snapshots und historische Kontrakt-Kerzen.
 * Sichert die relationale Integrität über die zentrale 'ticker' Integer-ID zu den Stammdaten.
 */
const DB_TABLE_CHAIN_SNAPSHOTS = 'option_chain_snapshots';
const DB_TABLE_CONTRACT_BARS = 'option_contract_bars';

export class OptionRepository {
    /**
     * @param {Object} supabaseClient - Die injizierte Datenbankverbindung
     */
    constructor(supabaseClient) {
        if (!supabaseClient) throw new Error('[OptionRepository] Kritisch: supabaseClient fehlt im Konstruktor!');
        this.supabaseClient = supabaseClient;
    }


    /**
     * ERWEITERUNG 1 (AlphaVantage Späher):
     * Schreibt die Echtzeit-Volumen-OI-Ratios relational in option_chain_snapshots.
     */
    async insertAlphaVantageRatios(tickerId, records) {
        if (!records || records.length === 0) return;

        const now = new Date().toISOString();
        const rowsToInsert = records.map(r => ({
            scraped_at: now,
            ticker: tickerId,
            ticker_symbol: r.symbol.toUpperCase(),
            contract_id: r.contract_id,
            expiration_date: r.expiration_date,
            option_type: r.option_type.toUpperCase(),
            strike: r.strike,
            volume_oi_ratio: r.volume_oi_ratio
        }));

        const chunkSize = 1000;
        for (let i = 0; i < rowsToInsert.length; i += chunkSize) {
            const chunk = rowsToInsert.slice(i, i + chunkSize);
            
            console.log(`[Option Repository] Speichere ${chunk.length} AlphaVantage-Ratios relational...`);
            
            const { error } = await this.supabaseClient
                .from(DB_TABLE_CHAIN_SNAPSHOTS)
                .upsert(chunk, {
                    onConflict: 'contract_id,scraped_at'
                });

            if (error) {
                console.error(`[Option Repository ERROR] Fehler in option_chain_snapshots:`, error.message);
                throw error;
            }
        }
    }

    /**
     * ERWEITERUNG 2 (Massive/Polygon Scharfschütze):
     * Speichert die 15-Minuten-Kerzen eines auffälligen Kontrakts relational ab.
     */
    async insertHistoricContractBars(tickerId, optionsTicker, bars) {
        if (!bars || bars.length === 0) return;

        const tickerClean = optionsTicker.toUpperCase();
        const rowsToInsert = bars.map(b => ({
            ticker: tickerId,
            contract_id: tickerClean,
            bar_timestamp: new Date(b.timestamp).toISOString(),
            volume: b.volume,
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
            vwap: b.vwap,
            trade_count: b.trade_count
        }));

        console.log(`[Option Repository] Speichere ${rowsToInsert.length} historische Bars relational für ${tickerClean}...`);

        const { error } = await this.supabaseClient
            .from(DB_TABLE_CONTRACT_BARS)
            .upsert(rowsToInsert, {
                onConflict: 'contract_id,bar_timestamp'
            });

        if (error) {
            console.error(`[Option Repository ERROR] Fehler in option_contract_bars:`, error.message);
            throw error;
        }
    }
}