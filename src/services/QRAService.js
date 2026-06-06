import ky from 'ky';
import * as cheerio from 'cheerio';

export function createQRAService() {
    const TREASURY_BASE_URL = 'https://home.treasury.gov';
    const PRESS_RELEASES_URL = `${TREASURY_BASE_URL}/news/press-releases`;

    /**
     * Sucht die aktuellste QRA Financing Estimate Pressemitteilung und extrahiert die Schätzwerte.
     * @returns {Promise<Object|null>} Objekt mit targetQuarter, estimatedNetBorrowing, estimatedTgaBalance
     */
    const fetchLatestFinancingEstimates = async () => {
        try {
            console.log(`[QRAService] Rufe Treasury Press Releases ab: ${PRESS_RELEASES_URL}`);
            
            // 1. Übersichtsseite laden
            const response = await ky.get(PRESS_RELEASES_URL).text();
            const $ = cheerio.load(response);

            let estimateArticleUrl = null;

            // 2. Nach dem spezifischen QRA-Artikel suchen
            // Das Treasury nennt diese Ankündigung meist "Treasury Announces Marketable Borrowing Estimates"
            $('a').each((i, element) => {
                const text = $(element).text().trim();
                if (text.includes('Marketable Borrowing Estimates') || text.includes('Financing Estimates')) {
                    const href = $(element).attr('href');
                    if (href) {
                        estimateArticleUrl = href.startsWith('http') ? href : `${TREASURY_BASE_URL}${href}`;
                        return false; // Break the loop
                    }
                }
            });

            if (!estimateArticleUrl) {
                console.log('[QRAService] Keine aktuelle QRA-Financing Ankündigung auf der Startseite gefunden.');
                return null;
            }

            console.log(`[QRAService] QRA-Artikel gefunden: ${estimateArticleUrl}. Extrahiere Daten...`);

            // 3. Den eigentlichen Artikel laden
            const articleHtml = await ky.get(estimateArticleUrl).text();
            const $article = cheerio.load(articleHtml);
            
            // Wir ziehen den gesamten Fließtext aus dem Hauptbereich
            const articleText = $article('div.field--type-text-with-summary, div.clearfix.text-formatted').text() || $article('body').text();

            // 4. Werte via RegEx extrahieren
            // Typischer Satz: "During the April – June 2026 quarter, Treasury expects to borrow $243 billion in privately-held net marketable debt, assuming an end-of-June cash balance of $750 billion."
            
            // RegEx für Net Borrowing (Sucht nach "$XYZ billion" im Kontext von "borrow")
            const borrowingMatch = articleText.match(/borrow\s+\$?([0-9,]+)\s+billion/i);
            const netBorrowing = borrowingMatch ? parseFloat(borrowingMatch[1].replace(/,/g, '')) * 1_000_000_000 : null;

            // RegEx für TGA Balance (Sucht nach "$XYZ billion" im Kontext von "cash balance")
            const tgaMatch = articleText.match(/cash balance of\s+\$?([0-9,]+)\s+billion/i);
            const tgaBalance = tgaMatch ? parseFloat(tgaMatch[1].replace(/,/g, '')) * 1_000_000_000 : null;

            // Quartal bestimmen (z.B. Q3 2026) basierend auf dem aktuellen Datum
            // Da Forward Guidance immer für das LAUFENDE oder NÄCHSTE Quartal ist, berechnen wir es grob
            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonth = now.getMonth() + 1; // 1-12
            let targetQuarter = '';

            // QRA Monate: Feb (Q1), Mai (Q2), Aug (Q3), Nov (Q4)
            if (currentMonth >= 1 && currentMonth <= 3) targetQuarter = `${currentYear}-Q1`;
            else if (currentMonth >= 4 && currentMonth <= 6) targetQuarter = `${currentYear}-Q2`;
            else if (currentMonth >= 7 && currentMonth <= 9) targetQuarter = `${currentYear}-Q3`;
            else targetQuarter = `${currentYear}-Q4`;

            if (netBorrowing === null && tgaBalance === null) {
                console.warn('[QRAService] Artikel gefunden, aber RegEx konnte die Milliardenbeträge nicht parsen. Textstruktur hat sich eventuell geändert.');
                return null;
            }

            return {
                targetQuarter,
                releaseDate: now.toISOString().split('T')[0], // YYYY-MM-DD
                estimatedNetBorrowing: netBorrowing,
                estimatedTgaBalance: tgaBalance
            };

        } catch (error) {
            console.error(`[QRAService] Fehler beim Scrapen der QRA-Daten: ${error.message}`);
            throw error;
        }
    };

    return {
        fetchLatestFinancingEstimates
    };
}