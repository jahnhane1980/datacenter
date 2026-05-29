import 'dotenv/config';
import { createRegulationService } from './src/services/RegulationService.js';
import { createRegulationRepository } from './src/repositories/RegulationRepository.js';
import { GoogleGenAI } from '@google/genai';

// ==========================================
// TEST-MODUS (Auf 'false' setzen für Live-Betrieb!)
// ==========================================
const TEST_MODE = false;

// Initialisierung der Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/**
 * Funktion, die den Text an Gemini sendet und das JSON parst
 */
async function analyzeDocumentWithLLM(text, title) {
    const prompt = `
Du bist ein hochpräziser Finanz- und Rechtsanalyst. 
Analysiere den folgenden Auszug (Abstract) aus dem Federal Register der USA bezüglich der 'Regulation D' (Mindestreservepflicht).

Deine einzige Aufgabe: Finde heraus, ob in diesem Text eine tatsächliche Änderung der Mindestreservequote (Reserve Requirement Ratio) verkündet wird. 
Ignoriere reine Inflationsanpassungen (exemption amounts, low reserve tranche indexation), die die Quote selbst nicht verändern.

Antworte AUSSCHLIESSLICH mit einem validen JSON-Objekt in folgendem Format:
{
  "ratio_changed": boolean,
  "new_ratio_percent": number | null,
  "reasoning": "Ein kurzer Satz mit deiner Begründung"
}

Hier ist der Text:
Titel: ${title}
Abstract: ${text}
`;

    // Fehler werden hier absichtlich nicht abgefangen, 
    // sondern an die aufrufende Schleife weitergereicht, 
    // damit wir den 503-Fehler dort mit process.exit() behandeln können.
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            responseMimeType: 'application/json'
        }
    });

    return JSON.parse(response.text);
}

async function runRegulationCheck() {
    console.log('Starte Überwachung auf regulatorische Änderungen (Regulation D)...');
    console.log(`TEST_MODE ist: ${TEST_MODE ? 'AKTIV (Nutze Mock-Daten)' : 'INAKTIV (Nutze Live-API)'}\n`);

    try {
        const regulationService = createRegulationService();
        const regulationRepository = createRegulationRepository();
        let documents = [];

        if (TEST_MODE) {
            // Mock-Daten für den lokalen Test
            documents = [
                {
                    document_number: 'TEST-NEGATIV-2023',
                    publication_date: '2023-10-15',
                    title: 'Reserve Requirements of Depository Institutions (Annual Indexing)',
                    abstract: 'The Board is amending Regulation D, Reserve Requirements of Depository Institutions, to reflect the annual indexing of the reserve requirement exemption amount and the low reserve tranche for 2024. The annual indexation of these amounts is required notwithstanding the Board\'s action in March 2020 of setting all reserve requirement ratios to zero.',
                    pdf_url: 'http://test.url/negativ'
                },
                {
                    document_number: 'TEST-POSITIV-2020',
                    publication_date: '2020-03-24',
                    title: 'Reserve Requirements of Depository Institutions (Ratio Reduction)',
                    abstract: 'The Board of Governors of the Federal Reserve System (Board) has adopted a final rule amending Regulation D (Reserve Requirements of Depository Institutions) to lower reserve requirement ratios on net transaction accounts to zero percent. This action eliminates reserve requirements for all depository institutions.',
                    pdf_url: 'http://test.url/positiv'
                }
            ];
        } else {
            // Live-Abfrage
            documents = await regulationService.fetchRecentRegulationD();
        }

        if (documents.length === 0) {
            console.log('Entwarnung: Keine relevanten Dokumente im Federal Register gefunden.');
            return;
        }

        console.log(`${documents.length} Dokumente geladen. Starte KI-Analyse für neue Einträge...\n`);

        let newDocumentsFound = 0;

        for (const doc of documents) {
            // Im Test-Modus ignorieren wir die DB-Prüfung, damit das Skript immer durchläuft
            const exists = TEST_MODE ? false : await regulationRepository.documentExists(doc.document_number);
            
            if (!exists) {
                console.log(`Prüfe Dokument: ${doc.document_number} (${doc.title})...`);
                
                let llmResult;
                try {
                    llmResult = await analyzeDocumentWithLLM(doc.abstract, doc.title);
                } catch (llmError) {
                    // Überprüfen auf den 503 "High Demand" Fehler
                    if (llmError.status === 503 || (llmError.message && llmError.message.includes('503'))) {
                        console.error('\n❌ KRITISCHER FEHLER: Die Google Gemini API ist aktuell überlastet (503 Service Unavailable).');
                        console.error('💡 HANDLUNGSEMPFEHLUNG: Da dieses Skript nur wöchentlich läuft, starte den GitHub Workflow ("Federal Register Regulation Sync") bitte in ein paar Stunden manuell neu (über den "Run workflow" Button unter "Actions").\n');
                        process.exit(1); // Bricht das gesamte Skript ab und setzt den GitHub Action Status auf "Failed"
                    } else {
                        console.error(`Unbekannter Fehler bei der LLM-Analyse für ${doc.document_number}:`, llmError.message);
                        console.log('Überspringe Dokument aufgrund eines internen Fehlers.');
                        continue;
                    }
                }

                console.log(`LLM Ergebnis:`, llmResult);

                if (llmResult.ratio_changed) {
                    console.log(`\n🚨🚨🚨 KATASTROPHEN-ALARM: DIE QUOTE WURDE GEÄNDERT! 🚨🚨🚨`);
                    console.log(`Neuer Wert: ${llmResult.new_ratio_percent}%`);
                    console.log(`Begründung: ${llmResult.reasoning}`);
                    console.log(`Link zum PDF: ${doc.pdf_url}\n`);
                    
                    // Neue Quote in das "Gehirn" (reserve_requirements) schreiben
                    if (!TEST_MODE) {
                        await regulationRepository.insertNewRatio(
                            doc.publication_date, 
                            llmResult.new_ratio_percent, 
                            doc.document_number
                        );
                    }
                } else {
                    console.log(`Entwarnung: Keine Änderung der Quote. (${llmResult.reasoning})\n`);
                }
                
                // Im Live-Betrieb in die DB schreiben (Gelesen-Liste)
                if (!TEST_MODE) {
                    await regulationRepository.insertDocument(
                        doc.document_number,
                        doc.publication_date,
                        doc.title,
                        doc.pdf_url,
                        doc.abstract
                    );
                }
                newDocumentsFound++;
            }
        }

        if (newDocumentsFound === 0 && !TEST_MODE) {
            console.log('Entwarnung: Alle gefundenen Dokumente sind bereits bekannt. Keine Neuigkeiten.');
        } else if (newDocumentsFound > 0 && !TEST_MODE) {
            console.log(`\nACHTUNG: Es wurden ${newDocumentsFound} neue Dokumente in der Datenbank protokolliert.`);
        }

    } catch (error) {
        console.error('Kritischer Fehler im Regulation-Sync-Skript:', error);
        process.exit(1);
    }
}

runRegulationCheck();