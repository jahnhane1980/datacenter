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
        
        // Helper für künstliche Verzögerung (Pacing)
        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        // Direkte Nutzung von fetchObservations für dynamisches Datum
        const tgaData = await fredService.fetchObservations(FRED_SERIES.TGA_BALANCE, startDate);
        await delay(1000);
        const rrpData = await fredService.fetchObservations(FRED_SERIES.REVERSE_REPO, startDate);
        await delay(1000);
        const fedData = await fredService.fetchObservations(FRED_SERIES.FED_BALANCE_SHEET, startDate);
        await delay(1000);
        const btfpData = await fredService.fetchObservations(FRED_SERIES.BANK_TERM_FUNDING_PROGRAM, startDate);
        await delay(1000);
        const bankReservesData = await fredService.fetchObservations(FRED_SERIES.BANK_RESERVES_FED_WEEKLY, startDate);
        await delay(1000);
        const sofrData = await fredService.fetchObservations(FRED_SERIES.SECURED_OVERNIGHT_FINANCING_RATE, startDate);
        await delay(1000);
        const depositsAllData = await fredService.fetchObservations(FRED_SERIES.DEPOSITS_ALL, startDate);
        await delay(1000);
        const demandDepositsData = await fredService.fetchObservations(FRED_SERIES.DEMAND_DEPOSITS, startDate);

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
                        sofr_rate: null,
                        deposits_all: null,
                        demand_deposits: null
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
        processSeries(depositsAllData, 'deposits_all');
        processSeries(demandDepositsData, 'demand_deposits');

        // Lade Makro-Definitionen für die neue normalisierte Tabelle (Option A)
        console.log('Lade Makro-Definitionen für das ID-Mapping...');
        const definitions = await fredRepository.getMacroIndicatorDefinitions();
        const definitionMap = {};
        for (const def of definitions) {
            definitionMap[def.series_id] = def.id;
        }

        // Mapping der lokalen Felder auf die offiziellen FRED_SERIES IDs
        const fieldToSeriesMap = {
            tga_balance: FRED_SERIES.TGA_BALANCE,
            rrp_balance: FRED_SERIES.REVERSE_REPO,
            fed_balance: FRED_SERIES.FED_BALANCE_SHEET,
            btfp_balance: FRED_SERIES.BANK_TERM_FUNDING_PROGRAM,
            bank_reserves_fed: FRED_SERIES.BANK_RESERVES_FED_WEEKLY,
            sofr_rate: FRED_SERIES.SECURED_OVERNIGHT_FINANCING_RATE,
            deposits_all: FRED_SERIES.DEPOSITS_ALL,
            demand_deposits: FRED_SERIES.DEMAND_DEPOSITS
        };

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
                values.sofr_rate === null &&
                values.deposits_all === null &&
                values.demand_deposits === null
            ) {
                skippedCount++;
                continue;
            }

            try {
                // 1. Legacy Upsert in flache Tabelle (Die neuen Deposit-Werte werden hier NICHT übergeben)
                await fredRepository.upsertMacroData(
                    date,
                    values.tga_balance,
                    values.rrp_balance,
                    values.fed_balance,
                    values.btfp_balance,
                    values.bank_reserves_fed,
                    values.sofr_rate
                );

                // 2. Normalisierter Upsert in die neue Tabellenstruktur
                const newIndicatorValues = [];
                for (const [fieldName, seriesId] of Object.entries(fieldToSeriesMap)) {
                    const value = values[fieldName];
                    const indicatorId = definitionMap[seriesId];

                    if (value !== null && indicatorId !== undefined) {
                        newIndicatorValues.push({
                            indicator_id: indicatorId,
                            observation_date: date,
                            value: value
                        });
                    }
                }

                if (newIndicatorValues.length > 0) {
                    await fredRepository.upsertMacroIndicatorValues(newIndicatorValues);
                }

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