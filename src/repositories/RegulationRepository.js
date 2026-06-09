const DB_TABLE_ALERTS = 'macro_reg_alerts';
const DB_TABLE_REQUIREMENTS = 'macro_reserve_requirements';

export function createRegulationRepository(supabaseClient) {
    /**
     * Prüft, ob ein Dokument anhand seiner ID (document_number) bereits in der Datenbank existiert.
     */
    const documentExists = async (documentNumber) => {
        const { data, error } = await supabaseClient
            .from(DB_TABLE_ALERTS)
            .select('document_number')
            .eq('document_number', documentNumber)
            .single();

        // Fehler-Code PGRST116 bedeutet "Keine Zeilen gefunden" -> Das ist für uns ein valider Zustand (Dokument ist neu)
        if (error && error.code !== 'PGRST116') { 
            throw new Error(`Fehler beim Prüfen des Dokuments: ${error.message}`);
        }

        return !!data;
    };

    /**
     * Speichert ein neues, bisher unbekanntes Dokument in der Datenbank.
     */
    const insertDocument = async (documentNumber, publicationDate, title, pdfUrl, abstractText) => {
        const { error } = await supabaseClient
            .from(DB_TABLE_ALERTS)
            .insert([{
                document_number: documentNumber,
                publication_date: publicationDate,
                title: title,
                pdf_url: pdfUrl,
                abstract: abstractText
            }]);

        if (error) {
            throw new Error(`Fehler beim Speichern des Dokuments: ${error.message}`);
        }
    };

    /**
     * Holt die aktuell gültige Mindestreservequote (den neuesten Eintrag).
     */
    const getCurrentRatio = async () => {
        const { data, error } = await supabaseClient
            .from(DB_TABLE_REQUIREMENTS)
            .select('ratio_percent')
            .order('effective_date', { ascending: false })
            .limit(1)
            .single();

        // Wenn die Tabelle unerwartet leer sein sollte, werfen wir einen Fehler, da wir den Init-Wert voraussetzen
        if (error) {
            throw new Error(`Fehler beim Abrufen der aktuellen Quote: ${error.message}`);
        }

        return data.ratio_percent;
    };

    /**
     * Speichert eine neue Mindestreservequote nach einem Alarm.
     */
    const insertNewRatio = async (effectiveDate, ratioPercent, documentNumber) => {
        const { error } = await supabaseClient
            .from(DB_TABLE_REQUIREMENTS)
            .insert([{
                effective_date: effectiveDate,
                ratio_percent: ratioPercent,
                document_number: documentNumber
            }]);

        if (error) {
            throw new Error(`Fehler beim Speichern der neuen Quote: ${error.message}`);
        }
    };

    return {
        documentExists,
        insertDocument,
        getCurrentRatio,
        insertNewRatio
    };
}