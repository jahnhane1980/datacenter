import 'dotenv/config';
import { AlphaVantageOptionService } from './src/services/AlphaVantageOptionService.js';

/**
 * Intraday Options-Späher
 * Holt stündlich die aktuellen Ratios aus der AlphaVantage Kette (Nur für Typ STOCK = 3).
 */
async function runIntradaySync() {
    console.log('[OPTIONS-INTRA] Starte stündlichen Options-Ratio Scan für STOCK Assets...');

    try {
        // 1. Zwingend dynamischer Import NACHDEM dotenv geladen ist
        const { supabaseClient } = await import('./src/core/SupabaseClient.js');
        const { TickerRepository } = await import('./src/repositories/TickerRepository.js');
        const { OptionRepository } = await import('./src/repositories/OptionRepository.js');

        // 2. Den Supabase-Client sauber in die Konstruktoren injizieren
        const tickerRepo = new TickerRepository(supabaseClient);
        const optionRepo = new OptionRepository(supabaseClient);
        const alphaVantageService = new AlphaVantageOptionService();

        // FIX: Hole ab sofort NUR NOCH Ticker vom Typ 3 (STOCK)
        const tickers = await tickerRepo.getAllTickers(3);
        if (!tickers || tickers.length === 0) {
            console.warn('[OPTIONS-INTRA] Keine STOCK-Ticker registriert. Breche ab.');
            return;
        }

        for (const tickerRow of tickers) {
            const tickerId = tickerRow.id;
            
            // Die Datenbank nutzt die Spalte 'name' statt 'symbol'
            const symbolUpper = tickerRow.name.toUpperCase();

            console.log(`\n[OPTIONS-INTRA] Scanne Ticker: ${symbolUpper} (ID: ${tickerId})`);

            try {
                const records = await alphaVantageService.fetchIntradayRatios(symbolUpper);
                if (!records || records.length === 0) continue;

                // Direktes, relationales Wegschreiben in option_chain_snapshots
                await optionRepo.insertAlphaVantageRatios(tickerId, records);
                console.log(`[OPTIONS-INTRA] ${records.length} Kontrakte für ${symbolUpper} verarbeitet.`);

            } catch (tickerError) {
                console.error(`[OPTIONS-INTRA ERROR] Fehler bei Ticker ${symbolUpper}:`, tickerError.message);
            }
        }
        console.log('\n[OPTIONS-INTRA] Stündlicher Scan beendet.');
    } catch (globalError) {
        console.error('[OPTIONS-INTRA FATAL]', globalError.message);
        process.exit(1);
    }
}

runIntradaySync();