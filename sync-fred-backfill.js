import 'dotenv/config';
import { createFredService, FRED_SERIES } from './src/services/FredService.js';
import { createFredRepository } from './src/repositories/FredRepository.js';

async function runBackfill() {
    console.log('Starte FRED Macro Liquidity Backfill (ab 2021-01-01)...');

    try {
        const fredService = createFredService();
        const fredRepository = createFredRepository();

        console.log('Lade historische Daten von der FRED API...');
        
        const [tgaData, rrpData, fedData, btfpData] = await Promise.all([
            fredService.getBackfillData(FRED_SERIES.TGA_BALANCE),
            fredService.getBackfillData(FRED_SERIES.REVERSE_REPO),
            fredService.getBackfillData(FRED_SERIES.FED_BALANCE_SHEET),
            fredService.getBackfillData(FRED_SERIES.BANK_TERM_FUNDING_PROGRAM)
        ]);

        console.log('Daten erfolgreich geladen. Führe Merge nach Datum durch...');

        const mergedDataByDate = new Map();

        const processSeries = (observations, fieldName) => {
            for (const obs of observations) {
                const date = obs.date;
                if (!mergedDataByDate.has(date)) {
                    mergedDataByDate.set(date, {
                        tga_balance: null,
                        rrp_balance: null,
                        fed_balance: null,
                        btfp_balance: null
                    });
                }
                
                const value = obs.value !== '.' ? parseFloat(obs.value) : null;
                mergedDataByDate.get(date)[fieldName] = value;
            }
        };

        processSeries(tgaData, 'tga_balance');
        processSeries(rrpData, 'rrp_balance');
        processSeries(fedData, 'fed_balance');
        processSeries(btfpData, 'btfp_balance');

        console.log(`Merge abgeschlossen. Überprüfe ${mergedDataByDate.size} eindeutige Tage...`);

        let successCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        for (const [date, values] of mergedDataByDate.entries()) {
            // Guard Clause: Überspringe Tage, an denen alle Werte null sind (Wochenenden/Feiertage)
            if (
                values.tga_balance === null &&
                values.rrp_balance === null &&
                values.fed_balance === null &&
                values.btfp_balance === null
            ) {
                skippedCount++;
                continue;
            }

            try {
                await fredRepository.upsertMacroData(
                    date,
                    values.tga_balance,
                    values.rrp_balance,
                    values.fed_balance,
                    values.btfp_balance
                );
                successCount++;
            } catch (err) {
                console.error(`Fehler beim Upsert für das Datum ${date}:`, err.message);
                errorCount++;
            }
        }

        console.log('Backfill erfolgreich beendet!');
        console.log(`Erfolgreiche Inserts/Updates: ${successCount}`);
        console.log(`Übersprungene leere Tage: ${skippedCount}`);
        console.log(`Fehlgeschlagene Inserts: ${errorCount}`);

    } catch (error) {
        console.error('Kritischer Fehler im Backfill-Skript:', error);
        process.exit(1);
    }
}

runBackfill();