import 'dotenv/config';
import ky from 'ky';

// Hilfsfunktion: Delay für API Rate-Limits
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function runEarningsBackfill() {
    console.log('=== ⏪ STARTE ALPHA VANTAGE EARNINGS BACKFILL ===');

    // KONFIGURATION: Zieldatum für den Backfill
    const TARGET_DATE = '2024-05-01'; 

    const apiKey = process.env.ALPHAVANTAGE_API_KEY;
    if (!apiKey) {
        console.error('❌ ALPHAVANTAGE_API_KEY fehlt in der .env Datei!');
        process.exit(1);
    }

    try {
        const { supabaseClient } = await import('./src/core/SupabaseClient.js');
        const { createTickerRepository } = await import('./src/repositories/TickerRepository.js');
        const { EventRepository } = await import('./src/repositories/EventRepository.js');

        const tickerRepo = createTickerRepository();
        const eventRepo = new EventRepository(supabaseClient);

        console.log('Lade Aktien (Typ 3) aus der Datenbank...');
        const allTickers = await tickerRepo.getAllTickers(3);

        if (!allTickers || allTickers.length === 0) {
            console.log('Keine Aktien gefunden.');
            return;
        }

        console.log(`${allTickers.length} Aktien geladen. Beginne sequenziellen Abruf...\n`);

        const api = ky.create({
            prefix: 'https://www.alphavantage.co',
            timeout: 30000,
            retry: { limit: 3, methods: ['get'] }
        });

        let totalInserts = 0;

        for (let i = 0; i < allTickers.length; i++) {
            const ticker = allTickers[i];
            console.log(`[${i + 1}/${allTickers.length}] Frage Historie ab für: ${ticker.name}...`);

            try {
                const path = `query?function=EARNINGS&symbol=${ticker.name}&apikey=${apiKey}`;
                const data = await api.get(path).json();

                // 1. Limit-Schutz: Alpha Vantage schickt bei Limits ein 200 OK mit Note/Information
                if (data["Note"] || data["Information"]) {
                    console.warn(`⚠️ [API Limit] für ${ticker.name}:`, data["Note"] || data["Information"]);
                    console.warn('Überspringe diesen Ticker. Bitte später erneut ausführen.');
                    continue; // Springt zum nächsten Ticker
                }

                // 2. Daten-Validierung
                if (!data.quarterlyEarnings || data.quarterlyEarnings.length === 0) {
                    console.log(`-> Keine Earnings-Daten für ${ticker.name} gefunden.`);
                } else {
                    const allInserts = [];
                    
                    // 3. Mapping und Zeitfilter
                    for (const event of data.quarterlyEarnings) {
                        // Wir nehmen nur die Events, die jünger oder gleich unserem TARGET_DATE sind
                        if (event.reportedDate >= TARGET_DATE) {
                            allInserts.push({
                                ticker_id: ticker.id,
                                ticker_name: ticker.name,
                                event_typ: 'EARNINGS',
                                event_datum: event.reportedDate,
                                beschreibung: `EPS Estimate: ${event.estimatedEPS || 'N/A'} | EPS Actual: ${event.reportedEPS || 'N/A'}`
                            });
                        }
                    }

                    // 4. In die Datenbank schreiben
                    if (allInserts.length > 0) {
                        await eventRepo.upsertEvents(allInserts);
                        totalInserts += allInserts.length;
                    } else {
                        console.log(`-> Keine Events seit dem ${TARGET_DATE} für ${ticker.name} gefunden.`);
                    }
                }

            } catch (error) {
                console.error(`❌ Fehler bei Ticker ${ticker.name}: ${error.message}`);
            }

            // 5. Rate Limit Protection: 15 Sekunden Pause zwischen den Calls
            // (Schützt vor dem 5 Calls / Minute Limit)
            if (i < allTickers.length - 1) {
                console.log(`⏳ Warte 15 Sekunden (Burst-Limit Schutz)...`);
                await delay(15000);
            }
        }

        console.log(`\n✅ Alpha Vantage Backfill abgeschlossen! Insgesamt ${totalInserts} historische Earnings geladen.`);

    } catch (error) {
        console.error('\nKritischer Fehler im Backfill:', error.message);
        process.exit(1);
    }
}

runEarningsBackfill();