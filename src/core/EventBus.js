import fs from 'fs';
import path from 'path';

const EVENT_FILE = path.join(process.cwd(), 'tmp_event', 'sys_events.json');

export class EventBus {
    /**
     * Schreibt ein Event in den lokalen File-Bus.
     * @param {string} source - Wer feuert das Event? (z.B. 'FiscalController')
     * @param {string} type - Was ist passiert? (z.B. 'treasury_auction_filled')
     * @param {Object} details - Die relevanten Daten (z.B. { cusip: '123' })
     */
    static emit(source, type, details = {}) {
        const event = {
            id: crypto.randomUUID(),
            source,
            type,
            timestamp: new Date().toISOString(),
            details
        };

        let events = [];
        
        // Verzeichnis anlegen falls nicht vorhanden
        const dir = path.dirname(EVENT_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        if (fs.existsSync(EVENT_FILE)) {
            try {
                const content = fs.readFileSync(EVENT_FILE, 'utf-8');
                if (content) {
                    events = JSON.parse(content);
                }
            } catch (err) {
                console.error('Fehler beim Lesen der sys_events.json:', err.message);
            }
        }

        events.push(event);

        try {
            fs.writeFileSync(EVENT_FILE, JSON.stringify(events, null, 2), 'utf-8');
            console.log(`[EventBus] Event emittiert: ${type} (Source: ${source})`);
        } catch (err) {
            console.error('Fehler beim Schreiben in sys_events.json:', err.message);
        }
    }
}
