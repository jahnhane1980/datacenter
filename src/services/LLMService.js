import ky from 'ky';

const GROQ_API_KEY = process.env.GROQ_API_KEY;

if (!GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY fehlt in der .env oder den GitHub Secrets!');
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export function createLLMService() {
    
    /**
     * Sendet einen unstrukturierten QRA-Artikel an Groq und extrahiert die JSON-Daten.
     * Enthält einen automatischen Retry-Mechanismus bei 429 Rate Limits.
     */
    const parseQraArticle = async (articleText, url) => {
        const systemPrompt = `Du bist ein hochpräziser Finanzdaten-Extraktor.
Lies die Pressemitteilung des US Treasury. Extrahiere die Schätzungen zur Netto-Kreditaufnahme (net marketable borrowing) und dem geplanten Cash-Bestand (cash balance) für das im Text angekündigte, ZUKÜNFTIGE Quartal.

Regeln:
1. Ignoriere historische Rückblicke (z.B. "During the previous quarter..."). Finde das zukünftige Quartal, das den Hauptfokus der Ankündigung bildet.
2. Wandle das gefundene Quartal in das Format "YYYY-QX" um (z.B. July-September 2025 -> "2025-Q3").
3. Wandle alle Milliarden/Billionen-Beträge in absolute Zahlen um (z.B. $1.007 trillion -> 1007000000000, $850 billion -> 850000000000).
4. Finde das exakte Veröffentlichungsdatum (Release Date) im Text (meist ganz oben) und formatiere es als "YYYY-MM-DD".

Du musst AUSSCHLIESSLICH in JSON antworten. Nutze exakt dieses Format:
{
  "target_quarter": "2025-Q3",
  "release_date": "2025-07-28",
  "estimated_net_borrowing": 1007000000000,
  "estimated_tga_balance": 850000000000
}`;

        let retryCount = 0;
        const maxRetries = 2; 

        while (retryCount <= maxRetries) {
            try {
                const response = await ky.post('https://api.groq.com/openai/v1/chat/completions', {
                    headers: {
                        'Authorization': `Bearer ${GROQ_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    json: {
                        model: 'llama-3.1-8b-instant', 
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: `Hier ist der Text des Artikels:\n\n${articleText}` }
                        ],
                        response_format: { type: 'json_object' },
                        temperature: 0.1,
                        max_tokens: 500
                    },
                    timeout: 30000
                }).json();

                const replyContent = response.choices[0].message.content.trim();
                return JSON.parse(replyContent);

            } catch (error) {
                if (error.response && error.response.status === 429) {
                    retryCount++;
                    console.log(`  [WARNUNG] 🧨 Groq Rate Limit (429) bei QRA Parsing. Versuch ${retryCount}/${maxRetries}. Zwangspause: 10 Sekunden...`);
                    await sleep(10000); 
                } else {
                    console.error(`  [GROQ FEHLER] Konnte QRA Artikel nicht parsen:`, error.message);
                    return null;
                }
            }
        }
        
        console.log(`  [ABBRUCH] Max Retries für Groq API erreicht (${url}).`);
        return null;
    };

    return {
        parseQraArticle
    };
}