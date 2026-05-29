import 'dotenv/config';
import { createFredService, FRED_SERIES } from './src/services/FredService.js';
import { createFredRepository } from './src/repositories/FredRepository.js';

async function runDailySync() {
    console.log('Starte täglichen FRED Macro Liquidity Sync...');

    try {
        const fredService = createFredService();
        const fredRepository = createFredRepository();

        let startDate;
        const latestDate = await fredRepository.getLatestObservationDate();

        if (latestDate) {
            startDate = latestDate;
            console.log(`Letzter Datenbankeintrag gefunden: ${latestDate}. Hole Delta bis heute...`);
        } else {
            // Fallback, falls die Tabelle komplett leer ist
            const date = new Date();
            date.setDate(date.getDate() - 14);
            startDate = date.toISOString().split('T')[0];
            console.log(`Kein Eintrag gefunden. Fallback auf die letzten 14 Tage (ab ${startDate})...`);
        }
        
        // Direkte Nutzung von fetchObservations für dynamisches Datum
        const [tgaData, rrpData, fedData, btfpData, bankReservesData, sofrData] = await Promise.all([
            fredService.fetchObservations(FRED_SERIES.TGA_BALANCE, startDate),
            fredService.fetchObservations(FRED_SERIES.REVERSE_REPO, startDate),
            fredService.fetchObservations(FRED_SERIES.FED_BALANCE_SHEET, startDate),
            fredService.fetchObservations(FRED_SERIES.BANK_TERM_FUNDING_PROGRAM, startDate),
            fredService.fetchObservations(FRED_SERIES.BANK_RESERVES_FED_WEEKLY, startDate),
            fredService.fetchObservations(FRED_SERIES.SECURED_OVERNIGHT_FINANCING_RATE, startDate)
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
                        btfp_balance: null,
                        bank_reserves_fed: null,
                        sofr_rate: null
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
        processSeries(bankReservesData, 'bank_reserves_fed');
        processSeries(sofrData, 'sofr_rate');

        console.log(`Starte Filterung und Upsert für ${mergedDataByDate.size} erfasste Tage (Delta)...`);

        let successCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        for (const [date, values] of mergedDataByDate.entries()) {
            // Guard Clause: Überspringe Tage, an denen alle Werte null sind
            if (
                values.tga_balance === null &&
                values.rrp_balance === null &&
                values.fed_balance === null &&
                values.btfp_balance === null &&
                values.bank_reserves_fed === null &&
                values.sofr_rate === null
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
                    values.btfp_balance,
                    values.bank_reserves_fed,
                    values.sofr_rate
                );
                successCount++;
            } catch (err) {
                console.error(`Fehler beim Upsert für das Datum ${date}:`, err.message);
                errorCount++;
            }
        }

        console.log('Daily Sync erfolgreich beendet!');
        console.log(`Erfolgreiche Inserts/Updates: ${successCount}`);
        console.log(`Übersprungene leere Tage: ${skippedCount}`);
        console.log(`Fehlgeschlagene Inserts: ${errorCount}`);

    } catch (error) {
        console.error('Kritischer Fehler im Sync-Skript:', error);
        process.exit(1);
    }
}

runDailySync();