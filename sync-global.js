import 'dotenv/config';
import { createGlobalMacroService } from './src/services/GlobalMacroService.js';
import { createGlobalMacroRepository } from './src/repositories/GlobalMacroRepository.js';

// Statisches Mapping der FRED FX-Ticker zu sauberen Währungspaaren
const FX_TICKERS = [
    { fredId: 'DEXUSEU', pair: 'EURUSD' }, // 1 EUR in USD
    { fredId: 'DEXJPUS', pair: 'USDJPY' }, // 1 USD in JPY
    { fredId: 'DEXCHUS', pair: 'USDCNY' }  // 1 USD in CNY
];

async function runGlobalSync() {
    console.log('Starte Global Macro & FX Sync (Daily)...');

    try {
        const globalService = createGlobalMacroService();
        const globalRepo = createGlobalMacroRepository();

        // ---------------------------------------------------------
        // TEIL 1: Globale Bilanzen & Indikatoren (Dynamisch aus DB)
        // ---------------------------------------------------------
        console.log('\n--- Starte Sync für Zentralbank-Bilanzen ---');
        const definitions = await globalRepo.getDefinitions();
        
        let cbSuccess = 0;
        let cbSkipped = 0;

        for (const def of definitions) {
            // Dynamisches Startdatum laden
            const latestDate = await globalRepo.getLatestGlobalDate(def.id);
            // Fallback, falls Tabelle leer (z.B. vor dem Backfill)
            const startDate = latestDate ? latestDate : '2024-01-01';
            
            console.log(`Hole Daten für ${def.series_id} (${def.region}) ab ${startDate}...`);
            const observations = await globalService.fetchSeriesData(def.series_id, startDate);
            
            for (const obs of observations) {
                // Überspringe Punkte ('.') die FRED manchmal als Fehler/Feiertagswerte sendet
                if (obs.value !== '.') {
                    const numericValue = parseFloat(obs.value);
                    await globalRepo.upsertGlobalData(def.id, obs.date, numericValue);
                    cbSuccess++;
                } else {
                    cbSkipped++;
                }
            }
        }
        console.log(`Zentralbanken Update: ${cbSuccess} Inserts, ${cbSkipped} leere Feiertage übersprungen.`);

        // ---------------------------------------------------------
        // TEIL 2: Tägliche FX Wechselkurse (Hartcodiertes Mapping)
        // ---------------------------------------------------------
        console.log('\n--- Starte Sync für FX-Wechselkurse ---');
        
        let fxSuccess = 0;
        let fxSkipped = 0;

        for (const fx of FX_TICKERS) {
            // Dynamisches Startdatum laden
            const latestDate = await globalRepo.getLatestFxDate(fx.pair);
            const startDate = latestDate ? latestDate : '2024-01-01';

            console.log(`Hole Wechselkurse für ${fx.pair} (FRED: ${fx.fredId}) ab ${startDate}...`);
            const observations = await globalService.fetchSeriesData(fx.fredId, startDate);
            
            for (const obs of observations) {
                if (obs.value !== '.') {
                    const numericValue = parseFloat(obs.value);
                    await globalRepo.upsertFxRate(obs.date, fx.pair, numericValue);
                    fxSuccess++;
                } else {
                    fxSkipped++;
                }
            }
        }
        console.log(`FX Update: ${fxSuccess} Inserts, ${fxSkipped} leere Feiertage übersprungen.`);
        
        console.log('\n>>> Global Macro Sync erfolgreich abgeschlossen! <<<');

    } catch (error) {
        console.error('Kritischer Fehler im Global Macro Sync-Skript:', error);
        process.exit(1);
    }
}

runGlobalSync();