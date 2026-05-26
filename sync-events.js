import 'dotenv/config';

// Hilfsfunktion: Datum formatieren in YYYY-MM-DD
function formatDate(date) {
    return date.toISOString().split('T')[0];
}

// Hilfsfunktion: Finnhub API Call
async function fetchFinnhub(endpoint, params = {}) {
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) throw new Error('FINNHUB_API_KEY fehlt in den Umgebungsvariablen!');

    const url = new URL(`https://finnhub.io/api/v1/${endpoint}`);
    url.searchParams.append('token', apiKey);
    
    for (const [key, value] of Object.entries(params)) {
        url.searchParams.append(key, value);
    }

    const response = await fetch(url.toString());
    if (!response.ok) {
        throw new Error(`Finnhub API Error auf ${endpoint}: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
}

async function runEventSync() {
    console.log('=== 📅 STARTE WEEKLY EVENT CALENDAR SYNC ===');

    try {
        // Dynamischer Import nach dotenv
        const { supabaseClient } = await import('./src/core/SupabaseClient.js');
        const { createTickerRepository } = await import('./src/repositories/TickerRepository.js');
        const { EventRepository } = await import('./src/repositories/EventRepository.js');
        const { FinnhubService } = await import('./src/services/FinnhubService.js');

        const tickerRepo = createTickerRepository();
        const eventRepo = new EventRepository(supabaseClient);
        const finnhubService = new FinnhubService();

        // 1. Ticker aus der eigenen Datenbank laden (Nur Typ 3 = STOCK)
        console.log('Lade Aktien (Typ 3) aus der Datenbank...');
        const allTickers = await tickerRepo.getAllTickers(3);
        
        if (!allTickers || allTickers.length === 0) {
            console.log('Keine Aktien (Typ 3) in der Datenbank gefunden. Breche Sync ab.');
            return;
        }
        
        // Map für blitzschnellen Abgleich erstellen (Name -> ID)
        const tickerMap = new Map();
        allTickers.forEach(t => tickerMap.set(t.name, t.id));
        console.log(`${tickerMap.size} Aktien als Filter-Referenz geladen.`);

        // 2. Zeitraum definieren (Heute bis Heute + 30 Tage)
        const today = new Date();
        const futureDate = new Date();
        futureDate.setDate(today.getDate() + 30);

        const fromDateStr = formatDate(today);
        const toDateStr = formatDate(futureDate);
        console.log(`Abfrage-Zeitraum: ${fromDateStr} bis ${toDateStr}`);

        const allInserts = [];

        // 3. EARNINGS abfragen und filtern
        console.log('Rufe Earnings-Daten von Finnhub ab...');
        const earningsData = await finnhubService.getEarningsCalendar(fromDateStr, toDateStr);

        if (earningsData && earningsData.earningsCalendar) {
            let earningsCount = 0;
            for (const event of earningsData.earningsCalendar) {
                if (tickerMap.has(event.symbol)) {
                    allInserts.push({
                        ticker_id: tickerMap.get(event.symbol),
                        ticker_name: event.symbol,
                        event_typ: 'EARNINGS',
                        event_datum: event.date,
                        beschreibung: `EPS Estimate: ${event.epsEstimate || 'N/A'} | EPS Actual: ${event.epsActual || 'N/A'}`
                    });
                    earningsCount++;
                }
            }
            console.log(`-> ${earningsCount} relevante Earnings-Events für eigene Aktien gefunden.`);
        }

        // 4. FDA Termine abfragen und filtern
        console.log('Rufe FDA-Kalender von Finnhub ab...');
        const fdaData = await finnhubService.getFdaCalendar();
        
        if (fdaData && Array.isArray(fdaData)) {
            let fdaCount = 0;
            for (const event of fdaData) {
                if (tickerMap.has(event.symbol) && event.date >= fromDateStr && event.date <= toDateStr) {
                    allInserts.push({
                        ticker_id: tickerMap.get(event.symbol),
                        ticker_name: event.symbol,
                        event_typ: 'FDA',
                        event_datum: event.date,
                        beschreibung: event.description || 'FDA Advisory Committee Meeting'
                    });
                    fdaCount++;
                }
            }
            console.log(`-> ${fdaCount} relevante FDA-Events für eigene Aktien gefunden.`);
        }

        // 5. DATENBANK BEREINIGEN & SCHREIBEN
        // Wir extrahieren alle IDs der Ticker, die wir gerade verarbeiten
        const tickerIds = Array.from(tickerMap.values());
        
        // Erst radikal alle zukünftigen Termine für diese Ticker löschen (löst das Verschiebungs-Problem)
        await eventRepo.deleteUpcomingEvents(tickerIds, fromDateStr);

        // Dann die aktuellen, frischen API-Termine eintragen
        if (allInserts.length > 0) {
            console.log(`Bereite Einfügen für ${allInserts.length} verifizierte Events vor...`);
            await eventRepo.upsertEvents(allInserts);
        } else {
            console.log('Keine anstehenden Events für den Zeitraum in der API gefunden.');
        }

        console.log('\n✅ Event Calendar Sync erfolgreich beendet.');

    } catch (error) {
        console.error('\nKritischer Fehler im Event Sync:', error.message);
        process.exit(1);
    }
}

runEventSync();