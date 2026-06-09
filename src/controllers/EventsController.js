import { SYNC_JOBS } from '../repositories/TickerRepository.js';

export class EventsController {
    /**
     * @param {Object} tickerRepo
     * @param {Object} eventRepo
     * @param {Object} finnhubService
     * @param {Object} httpClient
     * @param {Object} pacingManager
     */
    constructor(tickerRepo, eventRepo, finnhubService, httpClient, pacingManager) {
        this.tickerRepo = tickerRepo;
        this.eventRepo = eventRepo;
        this.finnhubService = finnhubService;
        this.httpClient = httpClient;
        this.pacingManager = pacingManager;
    }

    _formatDate(date) {
        return date.toISOString().split('T')[0];
    }

    async runDailySync() {
        console.log('=== 📅 STARTE WEEKLY EVENT CALENDAR SYNC ===');

        const allTickers = await this.tickerRepo.getTickersForJob(SYNC_JOBS.EVENTS);
        
        if (!allTickers || allTickers.length === 0) {
            console.log('Keine Ticker für EVENTS in der Datenbank gefunden. Breche Sync ab.');
            return;
        }
        
        const tickerMap = new Map();
        allTickers.forEach(t => tickerMap.set(t.name, t.id));
        console.log(`${tickerMap.size} Aktien als Filter-Referenz geladen.`);

        const today = new Date();
        const futureDate = new Date();
        futureDate.setDate(today.getDate() + 30);

        const fromDateStr = this._formatDate(today);
        const toDateStr = this._formatDate(futureDate);
        console.log(`Abfrage-Zeitraum: ${fromDateStr} bis ${toDateStr}`);

        const allInserts = [];

        console.log('Rufe Earnings-Daten von Finnhub ab...');
        const earningsData = await this.finnhubService.getEarningsCalendar(fromDateStr, toDateStr);

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

        console.log('Rufe FDA-Kalender von Finnhub ab...');
        const fdaData = await this.finnhubService.getFdaCalendar();
        
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

        const tickerIds = Array.from(tickerMap.values());
        
        await this.eventRepo.deleteUpcomingEvents(tickerIds, fromDateStr);

        if (allInserts.length > 0) {
            console.log(`Bereite Einfügen für ${allInserts.length} verifizierte Events vor...`);
            await this.eventRepo.upsertEvents(allInserts);
        } else {
            console.log('Keine anstehenden Events für den Zeitraum in der API gefunden.');
        }

        console.log('\n✅ Event Calendar Sync erfolgreich beendet.');
    }

    async runBackfill() {
        console.log('=== ⏪ STARTE ALPHA VANTAGE EARNINGS BACKFILL ===');

        const TARGET_DATE = '2024-05-01'; 
        const apiKey = process.env.ALPHAVANTAGE_API_KEY;

        if (!apiKey) {
            throw new Error('ALPHAVANTAGE_API_KEY fehlt in der .env Datei!');
        }

        const allTickers = await this.tickerRepo.getTickersForJob(SYNC_JOBS.EVENTS);

        if (!allTickers || allTickers.length === 0) {
            console.log('Keine Ticker für EVENTS gefunden.');
            return;
        }

        console.log(`${allTickers.length} Aktien geladen. Beginne sequenziellen Abruf...\n`);

        let totalInserts = 0;

        for (let i = 0; i < allTickers.length; i++) {
            const ticker = allTickers[i];
            console.log(`[${i + 1}/${allTickers.length}] Frage Historie ab für: ${ticker.name}...`);

            try {
                const path = `query?function=EARNINGS&symbol=${ticker.name}&apikey=${apiKey}`;
                const data = await this.httpClient.get(path).json();

                if (data["Note"] || data["Information"]) {
                    console.warn(`⚠️ [API Limit] für ${ticker.name}:`, data["Note"] || data["Information"]);
                    console.warn('Überspringe diesen Ticker. Bitte später erneut ausführen.');
                    continue; 
                }

                if (!data.quarterlyEarnings || data.quarterlyEarnings.length === 0) {
                    console.log(`-> Keine Earnings-Daten für ${ticker.name} gefunden.`);
                } else {
                    const allInserts = [];
                    
                    for (const event of data.quarterlyEarnings) {
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

                    if (allInserts.length > 0) {
                        await this.eventRepo.upsertEvents(allInserts);
                        totalInserts += allInserts.length;
                    } else {
                        console.log(`-> Keine Events seit dem ${TARGET_DATE} für ${ticker.name} gefunden.`);
                    }
                }

            } catch (error) {
                console.error(`❌ Fehler bei Ticker ${ticker.name}: ${error.message}`);
            }

            if (i < allTickers.length - 1) {
                console.log(`⏳ Warte 15 Sekunden (Burst-Limit Schutz)...`);
                if (this.pacingManager) await this.pacingManager.sleepMs(100);
            }
        }

        console.log(`\n✅ Alpha Vantage Backfill abgeschlossen! Insgesamt ${totalInserts} historische Earnings geladen.`);
    }
}
