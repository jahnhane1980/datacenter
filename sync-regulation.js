import 'dotenv/config';
import { createRegulationService } from './src/services/RegulationService.js';
import { createRegulationRepository } from './src/repositories/RegulationRepository.js';

async function runRegulationCheck() {
    console.log('Starte Überwachung auf regulatorische Änderungen (Regulation D)...');

    try {
        const regulationService = createRegulationService();
        const regulationRepository = createRegulationRepository();

        // 1. Daten von der API holen
        const documents = await regulationService.fetchRecentRegulationD();
        
        if (documents.length === 0) {
            console.log('Entwarnung: Keine relevanten Dokumente im Federal Register gefunden.');
            return;
        }

        console.log(`${documents.length} Dokumente von der API geladen. Prüfe gegen lokale Datenbank...`);

        let newDocumentsFound = 0;

        // 2. Jedes Dokument prüfen
        for (const doc of documents) {
            const exists = await regulationRepository.documentExists(doc.document_number);
            
            if (!exists) {
                console.log(`\n🚨 ALARM: Neues Dokument gefunden!`);
                console.log(`Datum: ${doc.publication_date}`);
                console.log(`Titel: ${doc.title}`);
                console.log(`Link:  ${doc.pdf_url || 'Kein PDF verfügbar'}\n`);
                
                // In DB eintragen, damit wir beim nächsten Mal nicht wieder alarmieren
                await regulationRepository.insertDocument(
                    doc.document_number,
                    doc.publication_date,
                    doc.title,
                    doc.pdf_url
                );
                newDocumentsFound++;
            }
        }

        // 3. Statusmeldung
        if (newDocumentsFound === 0) {
            console.log('Entwarnung: Alle gefundenen Dokumente sind bereits bekannt. Keine Neuigkeiten.');
        } else {
            console.log(`\nACHTUNG: Es wurden ${newDocumentsFound} neue Dokumente in der Datenbank protokolliert.`);
            // Hinweis für die spätere GitHub Action: 
            // Hier könnten wir z.B. einen Webhook an dein Handy schicken oder mit process.exit(1) die Action auf "Failed" setzen.
        }

    } catch (error) {
        console.error('Kritischer Fehler im Regulation-Sync-Skript:', error);
        process.exit(1);
    }
}

runRegulationCheck();