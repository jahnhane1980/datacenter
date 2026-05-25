import 'dotenv/config';
import { TickerRepository } from './src/repositories/TickerRepository.js';
import { CboeRepository } from './src/repositories/CboeRepository.js';
import { CboeService } from './src/services/CboeService.js';

// Hilfsfunktion für einen dynamischen, menschenähnlichen Sleep
async function humanSleep(minSeconds = 8, maxSeconds = 15) {
    const ms = Math.floor(Math.random() * (maxSeconds - minSeconds + 1) + minSeconds) * 1000;
    console.log(`[Human Protection] Schlafe für ${(ms / 1000).toFixed(1)} Sekunden, um menschliches Verhalten zu simulieren...`);
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function syncCboeOptions() {
    console.log('=== Starte CBOE Options Volume Sync ===');

    const { supabaseClient } = await import('./src/core/SupabaseClient.js');

    const tickerRepo = new TickerRepository(supabaseClient);
    const cboeRepo = new CboeRepository(); 
    const cboeService = new CboeService();

    // GEFILTERT AUF TYP 3: STOCK
    const tickers = await tickerRepo.getAllTickers(3);
    if (!tickers || tickers.length === 0) {
        console.log('Keine Ticker (Typ: STOCK) für den Sync gefunden.');
        return;
    }

    const today = new Date();
    const toDateStr = today.toISOString().split('T')[0];

    for (const ticker of tickers) {
        console.log(`\nVerarbeite CBOE-Volumen für ${ticker.name}...`);

        try {
            // 1. Delta-Check: Haben wir eine Lücke/Divergenz in den Daten?
            const latestTimestamp = await cboeRepo.getLatestTimestamp(ticker.id);
            let fromDateStr;

            if (!latestTimestamp) {
                // Initialer Backfill (2 Jahre)
                console.log(`[${ticker.name}] Keine historischen CBOE-Daten gefunden. Starte 2-Jahres-Backfill.`);
                const backfillDate = new Date();
                backfillDate.setFullYear(today.getFullYear() - 2);
                fromDateStr = backfillDate.toISOString().split('T')[0];
            } else {
                // Routine-Sync oder Lücken-Füller
                const nextDate = new Date((latestTimestamp + 86400) * 1000);
                if (nextDate > today) {
                    console.log(`[${ticker.name}] Daten-Integrität geprüft: DB ist lückenlos aktuell. Überspringe API-Abfrage.`);
                    continue;
                }
                fromDateStr = nextDate.toISOString().split('T')[0];
            }

            // 2. Eigentlicher API-Call (Wird durch den Check oben im Alltag nur 1x pro Ticker ausgeführt)
            const records = await cboeService.fetchOptionsVolume(ticker.name, fromDateStr, toDateStr);

            let addedRecords = 0;
            for (const record of records) {
                const dateParts = record['Trade Date'].split('/');
                if (dateParts.length === 3) {
                    const dateUtc = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2]));
                    const timestampSeconds = Math.floor(dateUtc.getTime() / 1000);
                    const volume = parseInt(record['Volume'], 10);

                    if (!isNaN(volume)) {
                        await cboeRepo.upsertVolumeData(ticker.id, timestampSeconds, volume);
                        addedRecords++;
                    }
                }
            }

            console.log(`[${ticker.name}] ${addedRecords} CBOE-Datensätze erfolgreich verarbeitet.`);

            // 3. Nach jedem erfolgreichen API-Call tarnen wir uns mit dem Human Jitter
            await humanSleep(8, 15);

        } catch (error) {
            console.error(`Fehler bei Ticker ${ticker.name}: ${error.message}`);
            // Auch bei Fehlern kurz warten, um im Loop nicht heißzulaufen
            await humanSleep(5, 10);
        }
    }

    console.log('\n=== CBOE Options Volume Sync abgeschlossen ===');
}

syncCboeOptions();