import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { NotificationService } from './src/services/NotificationService.js';
import { LLMService } from './src/services/LLMService.js';
import { createPacingManager } from './src/managers/PacingManager.js';

/**
 * ============================================================================
 * 🚨 ALERT & NOTIFICATION ORCHESTRATOR (File-based Event Queue)
 * ============================================================================
 * 
 * WARUM DIESE DATEI?
 * -----------------
 * Diese Datei läuft streng getrennt von `sync.js`. Das garantiert, dass unser 
 * Daten-Sync (die wichtigste Aufgabe des Systems) niemals abstürzt, nur weil 
 * eine E-Mail nicht rausgeht oder ein LLM-Aufruf (Groq) einen Timeout hat.
 * 
 * WIE FUNKTIONIERT DER LOKALE EVENT BUS?
 * --------------------------------------
 * Wir verzichten komplett auf neue Datenbank-Tabellen. Da dieses Script und 
 * `sync.js` im selben GitHub-Action-Lauf ausgeführt werden, teilen sie sich 
 * das lokale Dateisystem.
 * 
 * DER WORKFLOW:
 * 1. SYNC: Ein Controller (z.B. FiscalController) bemerkt eine wichtige Änderung
 *    (z.B. Auktionsdaten wurden ausgefüllt). Er ruft `EventBus.emit(...)` auf.
 *    Dadurch wird das Event in `tmp_event/sys_events.json` geschrieben.
 * 2. ALERTING: Diese Datei (`alert.js`) wird nach dem Sync aufgerufen. Sie liest 
 *    die `sys_events.json` Datei aus.
 * 3. VERARBEITUNG: Die Events werden vom Groq LLM analysiert, um aus rohen JSON-Zahlen
 *    verständliche Makro-Einschätzungen für Investoren zu generieren.
 * 4. CLEANUP: Nach erfolgreicher Verarbeitung löscht `alert.js` die Datei 
 *    `sys_events.json` rückstandslos.
 * ============================================================================
 */

const EVENT_FILE = path.join(process.cwd(), 'tmp_event', 'sys_events.json');

async function main() {
    try {
        console.log(`\n======================================================`);
        console.log(`🧠 Starte Alerting & Analysis Orchestrator`);
        console.log(`======================================================\n`);

        if (!fs.existsSync(EVENT_FILE)) {
            console.log('✅ Keine neuen Events in tmp_event/sys_events.json gefunden.');
            console.log('Alert-Lauf beendet.');
            process.exit(0);
        }

        const content = fs.readFileSync(EVENT_FILE, 'utf-8');
        let events = [];
        try {
            events = JSON.parse(content);
        } catch (err) {
            console.error('Fehler beim Parsen der sys_events.json. Lösche Datei...', err.message);
            fs.unlinkSync(EVENT_FILE);
            process.exit(1);
        }

        if (events.length === 0) {
            console.log('✅ Event-Datei ist leer.');
            fs.unlinkSync(EVENT_FILE);
            process.exit(0);
        }

        console.log(`Verarbeite ${events.length} Event(s)...`);

        const notificationService = new NotificationService();
        const llmService = new LLMService(createPacingManager());

        for (const event of events) {
            console.log(`\n-> Behandle Event: [${event.source}] ${event.type}`);
            
            // 1. LLM Analyse anfordern
            console.log(`   Generiere KI-Zusammenfassung via Groq...`);
            const aiAnalysis = await llmService.analyzeMacroEvent(event);
            
            // 2. Fallback falls Groq fehlschlägt
            const messageBody = aiAnalysis || `[KI-Analyse fehlgeschlagen]\n\nRohdaten:\n${JSON.stringify(event.details, null, 2)}`;
            const subject = `FinanceOS: ${event.type}`;

            // 3. Benachrichtigung versenden
            await notificationService.send(subject, messageBody);
        }

        // Cleanup: Datei löschen, da alles verarbeitet wurde
        console.log('\n🧹 Lösche tmp_event/sys_events.json...');
        fs.unlinkSync(EVENT_FILE);

        console.log(`======================================================`);
        console.log(`✅ Alle Events erfolgreich abgearbeitet.`);
        console.log(`======================================================\n`);

        process.exit(0);
    } catch (error) {
        console.error('Kritischer Fehler im Alerting:', error.message || error);
        process.exit(1);
    }
}

main();
