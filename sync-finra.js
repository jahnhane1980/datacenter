import 'dotenv/config';
import { createTickerRepository, SYNC_JOBS } from './src/repositories/TickerRepository.js';
import { FinraRepository } from './src/repositories/FinraRepository.js';
import { FinraService } from './src/services/FinraService.js';

/**
 * Extrahiert das Datum aus einer standardisierten FINRA-RegSho-Dateinamen-URL.
 * @param {string} url - Die vollständige URL zur TXT-Datei.
 * @returns {string|null} Das extrahierte Datum im Format "YYYY-MM-DD" oder null.
 */
function parseDateFromUrl(url) {
    const match = url.match(/CNMSshvol(\d{4})(\d{2})(\d{2})\.txt/);
    if (match) {
        return `${match[1]}-${match[2]}-${match[3]}`;
    }
    return null;
}

/**
 * Verzögert die Ausführung um eine kurze, zufällige Zeitspanne (12 bis 27 Sekunden).
 * Wird nur angewendet, wenn im aktuellen Lauf mehr als eine Datei geladen werden muss.
 * @returns {Promise<void>} Resolves, wenn die Wartezeit abgelaufen ist.
 */
async function liveDelay() {
    const seconds = Math.floor(Math.random() * (27 - 12 + 1) + 12);
    console.log(`[Live-Tarnung] Warte ${seconds} Sekunden bis zur nächsten Datei...`);
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

/**
 * Führt den täglichen, nach vorne gerichteten FINRA Short Sale Volume Sync aus.
 * Ermittelt das global neueste Datum der DB und lädt fehlende Folgetage (max. 5 Dateien).
 * @returns {Promise<void>}
 */
async function syncFinraShortVolumeLive() {
    console.log('=== Starte FINRA Short Sale Volume Sync (LIVE-MODE) ===');

    const { supabaseClient } = await import('./src/core/SupabaseClient.js');

    const tickerRepo = createTickerRepository();
    const finraRepo = new FinraRepository();
    const finraService = new FinraService();

    // 1. Alle zu überwachenden Ticker laden (Job-gesteuert)
    const tickers = await tickerRepo.getTickersForJob(SYNC_JOBS.SHORT_VOLUME);
    if (!tickers || tickers.length === 0) {
        console.log('Keine Ticker für SHORT_VOLUME in der DB gefunden.');
        return;
    }

    const tickerMap = new Map(tickers.map(t => [t.name.toUpperCase(), t.id]));

    // 2. Global neuesten Zeitstempel aus der DB abfragen
    const latestGlobalTimestamp = await finraRepo.getLatestTimestamp();
    
    let localCutoffDateStr = "1970-01-01";
    if (latestGlobalTimestamp) {
        const latestDbDate = new Date(latestGlobalTimestamp * 1000);
        localCutoffDateStr = latestDbDate.toISOString().split('T')[0];
        console.log(`[Live-Analyse] Global neuester Eintrag in der DB vom: ${localCutoffDateStr}`);
    } else {
        console.log('[Live-Analyse] Keine bestehenden Daten gefunden. Starte im Fallback-Modus.');
    }

    // 3. Relevante Monate für die API-Abfrage bestimmen (Heute & Vormonat, um Monatsübergänge zu sichern)
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
        const links = await finraService.getDownloadLinksForPeriod(period.year, period.month);
        allCandidateLinks = allCandidateLinks.concat(links);
    }

    // Eindeutigkeit sichern und nach Datum aufsteigend sortieren (wichtig für chronologischen Vorwärts-Sync)
    const uniqueLinks = [...new Set(allCandidateLinks)].sort();

    // 5. Links filtern, die zeitlich NACH unserem globalen Cutoff liegen
    const linksToDownload = uniqueLinks.filter(url => {
        const fileDateStr = parseDateFromUrl(url);
        if (!fileDateStr) return false;
        // Nur URLs zulassen, deren Datum strikt größer als das Datum in der DB ist
        return fileDateStr > localCutoffDateStr;
    });

    if (linksToDownload.length === 0) {
        console.log('[Live-Analyse] Datenbank ist bereits auf dem absolut neuesten Stand. Keine neuen Dateien verfügbar.');
        return;
    }

    // Strikte Begrenzung auf maximal 5 Dateien pro Request-Welle
    const finalSelection = linksToDownload.slice(0, 5);
    console.log(`[Live-Analyse] Es stehen ${linksToDownload.length} neue Dateien bereit. Verarbeite jetzt die nächsten ${finalSelection.length} Dateien.`);

    // 6. Verarbeitungsschleife
    for (let index = 0; index < finalSelection.length; index++) {
        const url = finalSelection[index];
        const fileDateStr = parseDateFromUrl(url);
        
        console.log(`\nVerarbeite Datei ${index + 1} von ${finalSelection.length} | Datum: ${fileDateStr}`);

        const dateParts = fileDateStr.split('-');
        const dateUtc = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2]));
        const timestampSeconds = Math.floor(dateUtc.getTime() / 1000);

        const fileContent = await finraService.downloadFileContent(url);
        if (!fileContent) {
            // 403/404 an Wochenenden/Feiertagen geräuschlos überspringen
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
                        await finraRepo.upsertShortData(tickerId, timestampSeconds, Math.floor(shortVolume), Math.floor(totalVolume));
                        addedRecords++;
                    }
                }
            }
        }

        console.log(`[FINRA] ${addedRecords} Datensätze für den ${fileDateStr} erfolgreich importiert.`);

        // Bedingtes Live-Delay: Nur wenn noch weitere Dateien in dieser Welle folgen
        if (finalSelection.length > 1 && index < finalSelection.length - 1) {
            await liveDelay();
        }
    }

    console.log('\n=== FINRA Live-Sync erfolgreich beendet ===');
}

syncFinraShortVolumeLive();