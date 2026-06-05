import 'dotenv/config';
import { createGlobalMacroService } from './src/services/GlobalMacroService.js';
import { createGlobalMacroRepository } from './src/repositories/GlobalMacroRepository.js';

// Statisches Mapping der FRED FX-Ticker zu sauberen Währungspaaren
const FX_TICKERS = [
    { fredId: 'DEXUSEU', pair: 'EURUSD' },
    { fredId: 'DEXJPUS', pair: 'USDJPY' },
    { fredId: 'DEXCHUS', pair: 'USDCNY' }
];

async function runBackfill() {
    console.log('Starte Global Macro & FX Backfill (Historischer Import)...');

    try {
        const globalService = createGlobalMacroService();
        const globalRepo = createGlobalMacroRepository();
        
        // Festes Startdatum für den historischen Import
        const backfillStartDate = '2010-01-01'; 
        console.log(`Datenabruf forciert ab: ${backfillStartDate}`);

        // ---------------------------------------------------------
        // TEIL 1: Globale Bilanzen & Indikatoren
        // ---------------------------------------------------------
        console.log('\n--- Starte Backfill für Zentralbank-Bilanzen ---');
        const definitions = await globalRepo.getDefinitions();
        
        let cbSuccess = 0;
        let cbSkipped = 0;

        for (const def of definitions) {
            console.log(`Hole Historie für ${def.series_id} (${def.region}) ab ${backfillStartDate}...`);
            const observations = await globalService.fetchSeriesData(def.series_id, backfillStartDate);
            
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
        console.log(`Zentralbanken Backfill: ${cbSuccess} Inserts, ${cbSkipped} leere Feiertage übersprungen.`);

        // ---------------------------------------------------------
        // TEIL 2: Tägliche FX Wechselkurse
        // ---------------------------------------------------------
        console.log('\n--- Starte Backfill für FX-Wechselkurse ---');
        
        let fxSuccess = 0;
        let fxSkipped = 0;

        for (const fx of FX_TICKERS) {
            console.log(`Hole Historie für ${fx.pair} (FRED: ${fx.fredId}) ab ${backfillStartDate}...`);
            const observations = await globalService.fetchSeriesData(fx.fredId, backfillStartDate);
            
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
        console.log(`FX Backfill: ${fxSuccess} Inserts, ${fxSkipped} leere Feiertage übersprungen.`);
        
        console.log('\n>>> Global Macro Backfill erfolgreich abgeschlossen! <<<');

    } catch (error) {
        console.error('Kritischer Fehler im Backfill-Skript:', error);
        process.exit(1);
    }
}

runBackfill();