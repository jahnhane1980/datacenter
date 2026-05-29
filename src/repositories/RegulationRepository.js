import { supabaseClient } from '../core/SupabaseClient.js';

export function createRegulationRepository() {
    /**
     * Prüft, ob ein Dokument anhand seiner ID (document_number) bereits in der Datenbank existiert.
     */
    const documentExists = async (documentNumber) => {
        const { data, error } = await supabaseClient
            .from('regulation_alerts')
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
    const insertDocument = async (documentNumber, publicationDate, title, pdfUrl) => {
        const { error } = await supabaseClient
            .from('regulation_alerts')
            .insert([{
                document_number: documentNumber,
                publication_date: publicationDate,
                title: title,
                pdf_url: pdfUrl
            }]);

        if (error) {
            throw new Error(`Fehler beim Speichern des Dokuments: ${error.message}`);
        }
    };

    return {
        documentExists,
        insertDocument
    };
}