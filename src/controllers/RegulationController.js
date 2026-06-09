export class RegulationController {
    /**
     * @param {Object} regulationRepo 
     * @param {Object} regulationService 
     * @param {Object} aiClient 
     */
    constructor(regulationRepo, regulationService, aiClient) {
        this.regulationRepo = regulationRepo;
        this.regulationService = regulationService;
        this.aiClient = aiClient;
    }

    async analyzeDocumentWithLLM(text, title) {
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

        const response = await this.aiClient.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: 'application/json'
            }
        });

        return JSON.parse(response.text);
    }

    async runRegulationCheck(testMode = false) {
        console.log('Starte Überwachung auf regulatorische Änderungen (Regulation D)...');
        console.log(`TEST_MODE ist: ${testMode ? 'AKTIV (Nutze Mock-Daten)' : 'INAKTIV (Nutze Live-API)'}\n`);

        let documents = [];

        if (testMode) {
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
            documents = await this.regulationService.fetchRecentRegulationD();
        }

        if (documents.length === 0) {
            console.log('Entwarnung: Keine relevanten Dokumente im Federal Register gefunden.');
            return;
        }

        console.log(`${documents.length} Dokumente geladen. Starte KI-Analyse für neue Einträge...\n`);

        let newDocumentsFound = 0;

        for (const doc of documents) {
            const exists = testMode ? false : await this.regulationRepo.documentExists(doc.document_number);
            
            if (!exists) {
                console.log(`Prüfe Dokument: ${doc.document_number} (${doc.title})...`);
                
                let llmResult;
                try {
                    llmResult = await this.analyzeDocumentWithLLM(doc.abstract, doc.title);
                } catch (llmError) {
                    if (llmError.status === 503 || (llmError.message && llmError.message.includes('503'))) {
                        console.error('\n❌ KRITISCHER FEHLER: Die Google Gemini API ist aktuell überlastet (503 Service Unavailable).');
                        console.error('💡 HANDLUNGSEMPFEHLUNG: Da dieses Skript nur wöchentlich läuft, starte den GitHub Workflow ("Federal Register Regulation Sync") bitte in ein paar Stunden manuell neu (über den "Run workflow" Button unter "Actions").\n');
                        // Throw to exit the process
                        throw llmError;
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
                    
                    if (!testMode) {
                        await this.regulationRepo.insertNewRatio(
                            doc.publication_date, 
                            llmResult.new_ratio_percent, 
                            doc.document_number
                        );
                    }
                } else {
                    console.log(`Entwarnung: Keine Änderung der Quote. (${llmResult.reasoning})\n`);
                }
                
                if (!testMode) {
                    await this.regulationRepo.insertDocument(
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

        if (newDocumentsFound === 0 && !testMode) {
            console.log('Entwarnung: Alle gefundenen Dokumente sind bereits bekannt. Keine Neuigkeiten.');
        } else if (newDocumentsFound > 0 && !testMode) {
            console.log(`\nACHTUNG: Es wurden ${newDocumentsFound} neue Dokumente in der Datenbank protokolliert.`);
        }
    }
}
