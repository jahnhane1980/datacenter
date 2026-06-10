import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { supabaseClient } from './src/core/SupabaseClient.js';
import { ActionRouter } from './src/core/ActionRouter.js';

const EVENT_FILE = path.join(process.cwd(), 'tmp_event', 'sys_events.json');

async function main() {
    try {
        console.log(`\n======================================================`);
        console.log(`🧠 Starte Alerting & Analysis Orchestrator (ActionRouter)`);
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

        const router = new ActionRouter(supabaseClient);

        for (const event of events) {
            console.log(`\n-> Behandle Event: [${event.source}] ${event.type}`);
            await router.execute(event);
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
