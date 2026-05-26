/**
 * SectorRotationRepository
 * Verwaltet den Lese- und Schreibzugriff für die Sektor-Rotation.
 */
export class SectorRotationRepository {
    constructor(supabaseClient) {
        if (!supabaseClient) throw new Error('[SectorRotationRepository] Kritisch: supabaseClient fehlt im Konstruktor!');
        this.supabaseClient = supabaseClient;
    }

    /**
     * Holt das jüngste Datum aus dem Log, um den Startpunkt für das Diff zu ermitteln.
     * @returns {Promise<string|null>} Das Datum im Format 'YYYY-MM-DD' oder null, wenn die Tabelle leer ist.
     */
    async getLatestLogDate() {
        const { data, error } = await this.supabaseClient
            .from('sector_rotation_log')
            .select('datum')
            .order('datum', { ascending: false })
            .limit(1)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return null; // Keine Einträge gefunden
            }
            throw new Error(`[SectorRotationRepository] Fehler beim Abrufen des letzten Datums: ${error.message}`);
        }

        return data ? data.datum : null;
    }

    /**
     * Schreibt die berechneten Sektor-Rotation-Logs in die Datenbank.
     * @param {Array<Object>} logs - Array von Log-Objekten.
     */
    async upsertLogs(logs) {
        if (!logs || logs.length === 0) {
            console.log('[SectorRotationRepository] Keine Daten zum Upsert vorhanden.');
            return;
        }

        const { error } = await this.supabaseClient
            .from('sector_rotation_log')
            .upsert(logs, { onConflict: 'datum, ticker_id' });

        if (error) {
            throw new Error(`[SectorRotationRepository] DB Upsert Error: ${error.message}`);
        }

        console.log(`✅ ${logs.length} Sektor-Rotation-Logs in die Datenbank geschrieben.`);
    }
}