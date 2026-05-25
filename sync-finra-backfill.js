import 'dotenv/config';
import { TickerRepository } from './src/repositories/TickerRepository.js';
import { FinraRepository } from './src/repositories/FinraRepository.js';
import { FinraService } from './src/services/FinraService.js';

/**
 * Extrahiert das Datum aus einer standardisierten FINRA-RegSho-Dateinamen-URL.
 * * @param {string} url - Die vollständige URL zur TXT-Datei.
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
 * Verzögert die Ausführung um eine zufällige Zeitspanne, um menschliches Browsing-Verhalten zu simulieren.
 * Beinhaltet eine 15%-ige Chance auf eine verlängerte "Kaffeepause".
 * * @returns {Promise<void>} Resolves, wenn die Wartezeit abgelaufen ist.
 */
async function humanDelay() {
    // Generiert eine zufällige Wartezeit zwischen 45 und 90 Sekunden
    const seconds = Math.floor(Math.random() * (90 - 45 + 1) + 45);
    
    // Simulation einer unregelmäßigen "Kaffeepause" (mit einer Chance von 15% wird die Pause deutlich länger)
    const isCoffeeBreak = Math.random() < 0.15;
    const finalSeconds = isCoffeeBreak ? seconds + Math.floor(Math.random() * (240 - 120 + 1) + 120) : seconds;

    if (isCoffeeBreak) {
        console.log(`[Menschliche Tarnung] Hole kurz Kaffee... Extra lange Pause für ${(finalSeconds / 60).toFixed(1)} Minuten.`);
    } else {
        console.log(`[Menschliche Tarnung] Verdaddle Zeit... Warte ${finalSeconds} Sekunden bis zum nächsten Tag.`);
    }

    return new Promise(resolve => setTimeout(resolve, finalSeconds * 1000));
}

/**
 * Führt den historischen Backfill für das FINRA Short Sale Volume durch.
 * Startet am 30.04.2026 und arbeitet sich dynamisch rückwärts bis maximal Mai 2024 vor.
 * Begrenzt jeden Durchlauf strikt auf maximal 3 noch nicht importierte Monate.
 * * @returns {Promise<void>}
 */
async function syncFinraShortVolumeBackfill() {
    console.log('=== Starte FINRA Short Sale Volume Sync (DYNAMIC BACKFILL - ULTRA-DEFENSIV) ===');

    const { supabaseClient } = await import('./src/core/SupabaseClient.js');

    const tickerRepo = new TickerRepository(supabaseClient);
    const finraRepo = new FinraRepository();
    const finraService = new FinraService();

    // 1. Ticker aus der DB laden
    const tickers = await tickerRepo.getAllTickers();
    if (!tickers || tickers.length === 0) {
        console.log('Keine Ticker für den Vergleich in der DB gefunden.');
        return;
    }

    const tickerMap = new Map(tickers.map(t => [t.name.toUpperCase(), t.id]));

    // =========================================================================
    // DYNAMISCHE ZEITRAUM-BERECHNUNG (Rückwärts ab 2026-04 bis 2024-05)
    // =========================================================================
    const START_YEAR = 2026;
    const START_MONTH = 4; // April
    const END_YEAR = 2024;
    const END_MONTH = 5; // Mai

    // Bereits importierte Monate aus der DB abfragen
    console.log('[Backfill-Planung] Analysiere bestehende Datenstände in der Datenbank...');
    const existingMonths = await finraRepo.getExistingMonths();

    // Theoretische Timeline generieren (Rückwärts)
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

    // Filtern: Nur Monate übrig lassen, die noch NICHT in der Datenbank existieren
    const missingPeriods = targetTimeline.filter(period => {
        const periodKey = `${period.year}-${period.month}`;
        return !existingMonths.has(periodKey);
    });

    if (missingPeriods.length === 0) {
        console.log('[Backfill-Planung] Alle Monate im Zielzeitraum (05/2024 - 04/2026) sind bereits vollständig abgedeckt!');
        return;
    }

    // Strikte Begrenzung auf maximal 3 Monate pro Skriptaufruf (Schutz vor IP-Sperren)
    const periodsToSync = missingPeriods.slice(0, 3);

    console.log(`[Backfill-Planung] Gefundene offene Monate gesamt: ${missingPeriods.length}`);
    console.log(`[Backfill-Planung] Dieser Durchlauf verarbeitet die nächsten ${periodsToSync.length} Monate:`);
    periodsToSync.forEach(p => console.log(` -> ${p.year}-${p.month}`));

    // =========================================================================
    // PROCESSING LOOP (Unveränderter Core-Algorithmus)
    // =========================================================================
    for (const period of periodsToSync) {
        console.log(`\n==============================================`);
        console.log(`Starte Sync-Lauf für Zeitraum: ${period.year}-${period.month}`);
        console.log(`==============================================`);

        try {
            const downloadLinks = await finraService.getDownloadLinksForPeriod(period.year, period.month);

            if (downloadLinks.length === 0) {
                console.log(`[FINRA] Keine Download-Links für ${period.year}-${period.month} gefunden.`);
                continue;
            }

            for (const url of downloadLinks) {
                const fileDateStr = parseDateFromUrl(url);
                if (!fileDateStr) continue;

                const dateParts = fileDateStr.split('-');
                const dateUtc = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2]));
                const timestampSeconds = Math.floor(dateUtc.getTime() / 1000);

                const fileContent = await finraService.downloadFileContent(url);
                if (!fileContent) {
                    // Wochenenden werfen 403/404, wir machen hier KEINE Pause, da kein Traffic entstand
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

                console.log(`[FINRA] ${addedRecords} Short-Sale-Datensätze für den ${fileDateStr} erfolgreich verarbeitet.`);

                // Nach jedem erfolgreichen Download greift die menschliche Bedenkzeit
                await humanDelay();
            }

        } catch (error) {
            console.error(`Fehler im Sync-Lauf für ${period.year}-${period.month}: ${error.message}`);
            // Bei Fehlern extra lang warten, um die IP abkühlen zu lassen
            await new Promise(resolve => setTimeout(resolve, 60000));
        }
    }

    console.log('\n=== FINRA Short Sale Volume Sync abgeschlossen ===');
}

syncFinraShortVolumeBackfill();