import 'dotenv/config';
import { createFredService, FRED_SERIES } from './src/services/FredService.js';
import { createFredRepository } from './src/repositories/FredRepository.js';

async function runBackfill() {
    console.log('Starte FRED Macro Liquidity Backfill...');

    try {
        const fredService = createFredService();
        const fredRepository = createFredRepository();

        // Letztes vorhandenes Datum aus der DB holen
        const latestDate = await fredRepository.getLatestObservationDate();
        
        // ACHTUNG: Temporär hart auf 2021-01-01 gesetzt, um WRESBAL historisch aufzufüllen!
        // Nach dem initialen Lauf wieder auf die auskommentierte Logik umstellen:
        // const startDate = latestDate ? latestDate : '2021-01-01';
        const startDate = '2021-01-01';

        console.log(`Letzter Datenbankeintrag: ${latestDate || 'Keiner gefunden'}. Hole Daten ab: ${startDate}...`);
        
        // Helper für künstliche Verzögerung (Pacing), um 429 Too Many Requests zu vermeiden
        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        // Sequenzieller Abruf mit 1 Sekunde Pause zwischen den Requests (Die sicherste Methode)
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

        // Lade Makro-Definitionen für das ID-Mapping (Option A)
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

        console.log(`Merge abgeschlossen. Überprüfe ${mergedDataByDate.size} eindeutige Tage auf Änderungen...`);

        let successCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        for (const [date, values] of mergedDataByDate.entries()) {
            // Guard Clause: Überspringe Tage, an denen alle Werte null sind (Wochenenden/Feiertage)
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
                // 1. Legacy Upsert in flache Tabelle (Dual-Write Beibehaltung ohne Deposit-Werte)
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

                    // Wir schreiben nur, wenn ein realer Wert existiert UND die ID in der DB gefunden wurde
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