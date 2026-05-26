/**
 * EventRepository
 * Verwaltet den Schreib- und Lesezugriff für den Event-Kalender (Earnings, FDA etc.).
 */
export class EventRepository {
    constructor(supabaseClient) {
        if (!supabaseClient) throw new Error('[EventRepository] Kritisch: supabaseClient fehlt im Konstruktor!');
        this.supabaseClient = supabaseClient;
    }

    /**
     * Löscht alle zukünftigen Events für eine Liste von Ticker-IDs ab einem bestimmten Datum.
     * Schützt vor Geister-Einträgen bei verschobenen Terminen.
     * @param {Array<number>} tickerIds - Array von Ticker-IDs
     * @param {string} fromDateStr - Startdatum im Format YYYY-MM-DD
     */
    async deleteUpcomingEvents(tickerIds, fromDateStr) {
        if (!tickerIds || tickerIds.length === 0) return;

        const { error } = await this.supabaseClient
            .from('event_calendar')
            .delete()
            .in('ticker_id', tickerIds)
            .gte('event_datum', fromDateStr);

        if (error) {
            throw new Error(`[EventRepository] Fehler beim Bereinigen zukünftiger Events: ${error.message}`);
        }

        console.log(`🧹 Zukünftige Events ab ${fromDateStr} für die verarbeiteten Ticker bereinigt.`);
    }

    /**
     * Schreibt die abgerufenen Events in die Datenbank (Upsert).
     * @param {Array<Object>} events - Array von Event-Objekten.
     */
    async upsertEvents(events) {
        if (!events || events.length === 0) {
            console.log('[EventRepository] Keine Events zum Upsert vorhanden.');
            return;
        }

        const { error } = await this.supabaseClient
            .from('event_calendar')
            .upsert(events, { onConflict: 'ticker_id, event_typ, event_datum' });

        if (error) {
            throw new Error(`[EventRepository] DB Upsert Error: ${error.message}`);
        }

        console.log(`✅ ${events.length} aktuelle Events in die Datenbank geschrieben.`);
    }
}