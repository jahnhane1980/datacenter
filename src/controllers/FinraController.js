import { SYNC_JOBS } from '../repositories/TickerRepository.js';
import { DateHelper } from '../core/DateHelper.js';

export class FinraController {
    /**
     * @param {Object} tickerRepository
     * @param {Object} finraRepository
     * @param {Object} finraService
     * @param {Object} pacingManager
     */
    constructor(tickerRepository, finraRepository, finraService, pacingManager) {
        this.tickerRepository = tickerRepository;
        this.finraRepository = finraRepository;
        this.finraService = finraService;
        this.pacingManager = pacingManager;
    }

    /**
     * Extrahiert das Datum aus einer standardisierten FINRA-RegSho-Dateinamen-URL.
     * @param {string} url - Die vollständige URL zur TXT-Datei.
     * @returns {string|null} Das extrahierte Datum im Format "YYYY-MM-DD" oder null.
     */
    parseDateFromUrl(url) {
        const match = url.match(/CNMSshvol(\d{4})(\d{2})(\d{2})\.txt/);
        if (match) {
            return `${match[1]}-${match[2]}-${match[3]}`;
        }
        return null;
    }



    /**
     * Führt den täglichen, nach vorne gerichteten FINRA Short Sale Volume Sync aus.
     */
    async runSync() {
        console.log('=== Starte FINRA Short Sale Volume Sync (LIVE-MODE) ===');

        // 1. Alle zu überwachenden Ticker laden
        const tickers = await this.tickerRepository.getTickersForJob(SYNC_JOBS.SHORT_VOLUME);
        if (!tickers || tickers.length === 0) {
            console.log('Keine Ticker für SHORT_VOLUME in der DB gefunden.');
            return;
        }

        const tickerMap = new Map(tickers.map(t => [t.name.toUpperCase(), t.id]));

        // 2. Global neuesten Zeitstempel aus der DB abfragen
        const latestGlobalTimestamp = await this.finraRepository.getLatestTimestamp();
        
        let localCutoffDateStr = "1970-01-01";
        if (latestGlobalTimestamp) {
            localCutoffDateStr = DateHelper.toSqlDate(DateHelper.fromUnixTimestamp(latestGlobalTimestamp));
            console.log(`[Live-Analyse] Global neuester Eintrag in der DB vom: ${localCutoffDateStr}`);
        } else {
            console.log('[Live-Analyse] Keine bestehenden Daten gefunden. Starte im Fallback-Modus.');
        }

        // 3. Relevante Monate für die API-Abfrage bestimmen
        const now = new Date();
        const currentYear = now.getUTCFullYear();
        const currentMonthStr = String(now.getUTCMonth() + 1).padStart(2, '0');

        const lastMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
        const lastMonthYear = lastMonthDate.getUTCFullYear();
        const lastMonthStr = String(lastMonthDate.getUTCMonth() + 1).padStart(2, '0');

        const periodsToQuery = [
            { year: lastMonthYear, month: lastMonthStr },
            { year: currentYear, month: currentMonthStr }
        ];

        // 4. Download-Links einsammeln
        let allCandidateLinks = [];
        for (const period of periodsToQuery) {
            const links = await this.finraService.getDownloadLinksForPeriod(period.year, period.month);
            allCandidateLinks = allCandidateLinks.concat(links);
        }

        const uniqueLinks = [...new Set(allCandidateLinks)].sort();

        // 5. Links filtern, die zeitlich NACH unserem globalen Cutoff liegen
        const linksToDownload = uniqueLinks.filter(url => {
            const fileDateStr = this.parseDateFromUrl(url);
            if (!fileDateStr) return false;
            return fileDateStr > localCutoffDateStr;
        });

        if (linksToDownload.length === 0) {
            console.log('[Live-Analyse] Datenbank ist bereits auf dem absolut neuesten Stand. Keine neuen Dateien verfügbar.');
            return;
        }

        const finalSelection = linksToDownload.slice(0, 5);
        console.log(`[Live-Analyse] Es stehen ${linksToDownload.length} neue Dateien bereit. Verarbeite jetzt die nächsten ${finalSelection.length} Dateien.`);

        // 6. Verarbeitungsschleife
        for (let index = 0; index < finalSelection.length; index++) {
            const url = finalSelection[index];
            const fileDateStr = this.parseDateFromUrl(url);
            
            console.log(`\nVerarbeite Datei ${index + 1} von ${finalSelection.length} | Datum: ${fileDateStr}`);

            const timestampSeconds = DateHelper.toUnixTimestamp(fileDateStr);

            const fileContent = await this.finraService.downloadFileContent(url);
            if (!fileContent) {
                continue; 
            }

            const lines = fileContent.split('\n');
            let addedRecords = 0;

            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                const parts = line.split('|');
                if (parts.length >= 5) {
                    const symbolUpper = parts[1].toUpperCase();

                    if (tickerMap.has(symbolUpper)) {
                        const tickerId = tickerMap.get(symbolUpper);
                        const shortVolume = parseFloat(parts[2]); 
                        const totalVolume = parseFloat(parts[4]);

                        if (!isNaN(shortVolume) && !isNaN(totalVolume)) {
                            await this.finraRepository.upsertShortData(tickerId, timestampSeconds, Math.floor(shortVolume), Math.floor(totalVolume));
                            addedRecords++;
                        }
                    }
                }
            }

            console.log(`[FINRA] ${addedRecords} Datensätze für den ${fileDateStr} erfolgreich importiert.`);

            if (finalSelection.length > 1 && index < finalSelection.length - 1) {
                if (this.pacingManager) {
                    console.log(`[Live-Tarnung] Warte bis zur nächsten Datei...`);
                    await this.pacingManager.humanDelay(12, 27);
                }
            }
        }

        console.log('\n=== FINRA Live-Sync erfolgreich beendet ===');
    }



    /**
     * Führt den historischen Backfill für das FINRA Short Sale Volume durch.
     */
    async runBackfill() {
        console.log('=== Starte FINRA Short Sale Volume Sync (DYNAMIC BACKFILL - ULTRA-DEFENSIV) ===');

        const tickers = await this.tickerRepository.getTickersForJob(SYNC_JOBS.SHORT_VOLUME);
        if (!tickers || tickers.length === 0) {
            console.log('Keine Ticker für SHORT_VOLUME in der DB gefunden.');
            return;
        }

        const tickerMap = new Map(tickers.map(t => [t.name.toUpperCase(), t.id]));

        const START_YEAR = 2026;
        const START_MONTH = 4; // April
        const END_YEAR = 2024;
        const END_MONTH = 5; // Mai

        console.log('[Backfill-Planung] Analysiere bestehende Datenstände in der Datenbank...');
        const existingMonths = await this.finraRepository.getExistingMonths();

        const targetTimeline = [];
        let currentYear = START_YEAR;
        let currentMonth = START_MONTH;

        while (currentYear > END_YEAR || (currentYear === END_YEAR && currentMonth >= END_MONTH)) {
            const monthStr = String(currentMonth).padStart(2, '0');
            targetTimeline.push({ year: currentYear, month: monthStr });

            currentMonth--;
            if (currentMonth === 0) {
                currentMonth = 12;
                currentYear--;
            }
        }

        const missingPeriods = targetTimeline.filter(period => {
            const periodKey = `${period.year}-${period.month}`;
            return !existingMonths.has(periodKey);
        });

        if (missingPeriods.length === 0) {
            console.log('[Backfill-Planung] Alle Monate im Zielzeitraum sind bereits vollständig abgedeckt!');
            return;
        }

        const periodsToSync = missingPeriods.slice(0, 3);

        console.log(`[Backfill-Planung] Gefundene offene Monate gesamt: ${missingPeriods.length}`);
        console.log(`[Backfill-Planung] Dieser Durchlauf verarbeitet die nächsten ${periodsToSync.length} Monate:`);
        periodsToSync.forEach(p => console.log(` -> ${p.year}-${p.month}`));

        for (const period of periodsToSync) {
            console.log(`\n==============================================`);
            console.log(`Starte Sync-Lauf für Zeitraum: ${period.year}-${period.month}`);
            console.log(`==============================================`);

            try {
                const downloadLinks = await this.finraService.getDownloadLinksForPeriod(period.year, period.month);

                if (downloadLinks.length === 0) {
                    console.log(`[FINRA] Keine Download-Links für ${period.year}-${period.month} gefunden.`);
                    continue;
                }

                for (const url of downloadLinks) {
                    const fileDateStr = this.parseDateFromUrl(url);
                    if (!fileDateStr) continue;

                    const timestampSeconds = DateHelper.toUnixTimestamp(fileDateStr);

                    const fileContent = await this.finraService.downloadFileContent(url);
                    if (!fileContent) {
                        continue; 
                    }

                    const lines = fileContent.split('\n');
                    let addedRecords = 0;

                    for (let i = 1; i < lines.length; i++) {
                        const line = lines[i].trim();
                        if (!line) continue;

                        const parts = line.split('|');
                        if (parts.length >= 5) {
                            const symbolUpper = parts[1].toUpperCase();

                            if (tickerMap.has(symbolUpper)) {
                                const tickerId = tickerMap.get(symbolUpper);
                                const shortVolume = parseFloat(parts[2]); 
                                const totalVolume = parseFloat(parts[4]);

                                if (!isNaN(shortVolume) && !isNaN(totalVolume)) {
                                    await this.finraRepository.upsertShortData(tickerId, timestampSeconds, Math.floor(shortVolume), Math.floor(totalVolume));
                                    addedRecords++;
                                }
                            }
                        }
                    }

                    console.log(`[FINRA] ${addedRecords} Short-Sale-Datensätze für den ${fileDateStr} erfolgreich verarbeitet.`);

                    if (this.pacingManager) await this.pacingManager.scrapingDelay();
                }

            } catch (error) {
                console.error(`Fehler im Sync-Lauf für ${period.year}-${period.month}: ${error.message}`);
                if (process.env.NODE_ENV !== 'test' && this.pacingManager) {
                    await this.pacingManager.sleepSeconds(60);
                }
            }
        }

        console.log('\n=== FINRA Short Sale Volume Sync abgeschlossen ===');
    }
}
