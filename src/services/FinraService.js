import ky from 'ky';

export class FinraService {
    /**
     * Erstellt eine Instanz des FinraService und konfiguriert den HTTP-Client
     * mit realistischen Browser-Headern zur Vermeidung von IP-Sperren.
     */
    constructor() {
        this.apiClient = ky.create({
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Origin': 'https://www.finra.org',
                'Referer': 'https://www.finra.org/'
            },
            timeout: 20000
        });
    }

    /**
     * Holt alle verfügbaren TXT-Download-Links für einen bestimmten Zeitraum.
     * Versucht zuerst die offizielle FINRA-API. Schlägt diese fehl oder weicht ab,
     * greift ein intelligentes URL-Guessing, das im aktuellen Monat niemals Tage aus der Zukunft generiert.
     * * @param {number} targetYear - Das Zieljahr (z.B. 2026).
     * @param {string} targetMonthStr - Der Zielmonat zweistellig (z.B. "05").
     * @returns {Promise<string[]>} Ein Array von vollständigen CDN-Download-URLs.
     */
    async getDownloadLinksForPeriod(targetYear, targetMonthStr) {
        console.log(`[FINRA API] Frage Dokumenten-Katalog für ${targetYear}-${targetMonthStr} ab...`);
        
        const apiUrl = 'https://api.finra.org/data/v1/browse-catalog/short-sale-volume-data/daily-short-sale-volume-files';
        
        try {
            const responseData = await this.apiClient.get(apiUrl).json();
            
            if (!responseData || !responseData.data) {
                console.log(`[FINRA API] Keine Daten vom API-Endpoint zurückgegeben.`);
                return [];
            }

            const links = responseData.data
                .map(item => item.url || item.file_url || item.href)
                .filter(href => {
                    if (!href) return false;
                    const pattern = `shvol${targetYear}${targetMonthStr}`;
                    return href.includes('cdn.finra.org') && href.toLowerCase().includes(pattern);
                });

            console.log(`[FINRA API] ${links.length} passende Download-Links für den Zeitraum direkt ermittelt.`);
            return links;

        } catch (error) {
            console.log(`[FINRA API] Fallback: Versuche intelligentes URL-Guessing...`);
            
            const guessedLinks = [];
            
            // Dynamische Ermittlung des aktuellen Datums im UTC-Kontext
            const now = new Date();
            const currentYear = now.getUTCFullYear();
            const currentMonth = now.getUTCMonth() + 1; // JS-Monate sind 0-basiert
            const currentDay = now.getUTCDate();

            // Maximalen Tag für die Schleife bestimmen
            let maxDay = 31;

            // Wenn wir den aktuellen Monat im aktuellen Jahr abfragen, begrenzen wir das Guessing
            if (targetYear === currentYear && parseInt(targetMonthStr, 10) === currentMonth) {
                // Wir raten maximal bis zum heutigen Tag
                maxDay = currentDay;
                console.log(`[Live-Guessing] Zeitraum entspricht aktuellem Monat. Begrenze Suche auf Tage 1 bis ${maxDay}.`);
            }

            for (let day = 1; day <= maxDay; day++) {
                const dayStr = String(day).padStart(2, '0');
                guessedLinks.push(`https://cdn.finra.org/equity/regsho/daily/CNMSshvol${targetYear}${targetMonthStr}${dayStr}.txt`);
            }
            return guessedLinks;
        }
    }

    /**
     * Lädt den Inhalt einer spezifischen TXT-Datei direkt vom FINRA-CDN herunter.
     * Abgebrochene oder nicht existierende Tage (Wochenenden/Feiertage) werden geräuschlos abgefangen.
     * * @param {string} url - Die vollständige CDN-URL der Datei.
     * @returns {Promise<string|null>} Der Dateiinhalt als Text oder null bei 403/404-Fehlern.
     * @throws {Error} Bei anderen Netzwerk- oder Timeout-Fehlern.
     */
    async downloadFileContent(url) {
        try {
            console.log(`[FINRA CDN] Lade: ${url}`);
            const responseText = await ky.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
                },
                timeout: 30000
            }).text();

            return responseText;
        } catch (error) {
            // FINRA blockiert ungenutzte Tage (Wochenenden/Feiertage) oft mit 403 Forbidden oder 404 Not Found.
            // Das fangen wir hier ab und überspringen den Tag geräuschlos.
            if (error.message.includes('403') || error.message.includes('404')) {
                return null;
            }
            throw new Error(`Fehler beim Dateidownload: ${error.message}`);
        }
    }
}