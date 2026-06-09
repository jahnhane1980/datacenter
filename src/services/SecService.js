import ky from 'ky';
import { EdgarClient } from 'sec-edgar-toolkit';

export function createSecService(userAgent = process.env.SEC_USER_AGENT) {
    if (!userAgent) {
        throw new Error('SEC_USER_AGENT ist nicht definiert. Bitte lokal in der .env oder online in den GitHub Secrets setzen (Format: AppName/1.0 (deine@email.com)).');
    }

    // Initialisiere den Client aus dem Toolkit für das automatische Queue-Management
    const edgarClient = new EdgarClient({ userAgent });

    /**
     * Holt das offizielle Mapping aller Ticker zu ihren CIKs (ca. 770 KB)
     * @returns {Promise<Array>} Array aus Objekten [{ ticker: 'AAPL', cik_str: 320193, title: 'Apple Inc.' }, ...]
     */
    const fetchCikMapping = async () => {
        try {
            const response = await ky.get('https://www.sec.gov/files/company_tickers.json', {
                headers: {
                    'User-Agent': userAgent,
                    'Accept-Encoding': 'gzip, deflate'
                }
            }).json();
            
            // Die SEC liefert ein Objekt mit numerischen Keys. Wir wandeln es in ein iterierbares Array um.
            return Object.values(response);
        } catch (error) {
            throw new Error(`Fehler beim Abrufen der SEC company_tickers.json: ${error.message}`);
        }
    };

    /**
     * Holt die neuesten Metadaten der Berichte für eine bestimmte CIK.
     * Nutzt das Toolkit, um das Rate-Limit von 10 Req/Sec einzuhalten.
     */
    const fetchLatestFilings = async (cik, isForeignIssuer = false, limit = 5) => {
        try {
            const formsToFetch = isForeignIssuer ? ['6-K', '20-F'] : ['10-Q', '10-K'];
            const submissions = await edgarClient.getCompanySubmissions(cik);
            
            if (!submissions || !submissions.filings || !submissions.filings.recent) {
                return [];
            }

            const recent = submissions.filings.recent;
            const matchedFilings = [];

            for (let i = 0; i < recent.form.length; i++) {
                const currentForm = recent.form[i];
                const primaryDoc = recent.primaryDocument[i];

                if (formsToFetch.includes(currentForm)) {
                    
                    // NEU: Anti-Spam Heuristik für 6-K Formulare im Speicher (Filtert Müll raus)
                    if (currentForm === '6-K' && primaryDoc) {
                        const lowerName = primaryDoc.toLowerCase();
                        const spamWords = ['monthend', 'dividend', 'board', 'revenue', 'sales', 'voting', 'shareholder', 'tosell'];
                        
                        if (spamWords.some(word => lowerName.includes(word))) {
                            continue; // Überspringe dieses Dokument und suche im JSON weiter
                        }
                    }

                    matchedFilings.push({
                        accessionNumber: recent.accessionNumber[i],
                        formType: currentForm,
                        filingDate: recent.filingDate[i],
                        primaryDocument: primaryDoc
                    });

                    if (matchedFilings.length >= limit) {
                        break;
                    }
                }
            }

            return matchedFilings;
        } catch (error) {
            throw new Error(`Fehler beim Abrufen der Filings für CIK ${cik}: ${error.message}`);
        }
    };

    /**
     * Lädt den rohen HTML/Text-Inhalt eines spezifischen Dokuments herunter.
     */
    const fetchFilingContent = async (cik, accessionNumber, primaryDocument, formType = '') => {
        try {
            const cleanCik = parseInt(cik, 10);
            const cleanAccession = accessionNumber.replace(/-/g, '');
            const baseUrl = `https://www.sec.gov/Archives/edgar/data/${cleanCik}/${cleanAccession}`;
            
            let targetDocument = primaryDocument;

            if (formType === '6-K' || formType === '8-K') {
                try {
                    const indexUrl = `${baseUrl}/index.json`;
                    const indexData = await ky.get(indexUrl, {
                        headers: {
                            'User-Agent': userAgent,
                            'Accept-Encoding': 'gzip, deflate'
                        }
                    }).json();

                    const files = indexData.directory.item;
                    const exhibit99 = files.find(f => 
                        f.name.toLowerCase().includes('ex99') || 
                        f.name.toLowerCase().includes('ex-99') ||
                        f.name.toLowerCase().includes('exhibit99')
                    );

                    if (exhibit99) {
                        targetDocument = exhibit99.name;
                        console.log(`      [EXHIBIT-SCANNER] Deckblatt ignoriert. Lade stattdessen Anhang: ${targetDocument}`);
                    } else {
                        console.log(`      [EXHIBIT-SCANNER] Kein Exhibit 99 gefunden. Lade Original-Deckblatt: ${targetDocument}`);
                    }
                } catch (idxErr) {
                    console.log(`      [EXHIBIT-SCANNER] Fehler beim Abrufen der Index-Datei. Lade Original-Deckblatt.`);
                }
            }
            
            const documentUrl = `${baseUrl}/${targetDocument}`;
            
            const content = await ky.get(documentUrl, {
                headers: {
                    'User-Agent': userAgent,
                    'Accept-Encoding': 'gzip, deflate'
                }
            }).text();

            return content;
        } catch (error) {
            throw new Error(`Fehler beim Herunterladen des Dokuments ${accessionNumber}: ${error.message}`);
        }
    };

    return {
        fetchCikMapping,
        fetchLatestFilings,
        fetchFilingContent
    };
}