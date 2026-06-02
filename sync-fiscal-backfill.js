import 'dotenv/config';
import { createFiscalService, TREASURY_TYPES } from './src/services/FiscalService.js';
import { createFiscalRepository } from './src/repositories/FiscalRepository.js';

async function runFiscalBackfill() {
    console.log('Starte Fiscal Data (Treasury Auctions) Backfill...');

    try {
        const fiscalService = createFiscalService();
        const fiscalRepository = createFiscalRepository();

        // Flexibles Startdatum - für saubere Pivot-Analysen wird 2022 empfohlen
        const startDate = '2022-01-01'; 
        
        // Treasury API erlaubt bis zu 10.000 Einträge pro Seite. 
        // 2000 reicht völlig für 3-4 Jahre, selbst bei wöchentlichen Bills.
        const BACKFILL_LIMIT = 2000; 

        console.log(`Hole Auktionsdaten ab dem ${startDate} (Limit pro Kategorie: ${BACKFILL_LIMIT})...`);

        // Paralleles Abrufen aller generischen Wertpapier-Typen (umfasst alle Laufzeiten)
        const [billsData, notesData, bondsData] = await Promise.all([
            fiscalService.fetchAuctions(TREASURY_TYPES.BILL, startDate, BACKFILL_LIMIT),
            fiscalService.fetchAuctions(TREASURY_TYPES.NOTE, startDate, BACKFILL_LIMIT),
            fiscalService.fetchAuctions(TREASURY_TYPES.BOND, startDate, BACKFILL_LIMIT)
        ]);

        const allAuctions = [...billsData, ...notesData, ...bondsData];
        
        console.log(`${allAuctions.length} historische Auktionen gefunden. Starte Datenaufbereitung und Upsert...`);

        let successCount = 0;
        let errorCount = 0;

        for (const auction of allAuctions) {
            try {
                // Typumwandlung der API-Strings in numerische Werte für die Datenbank
                const bidToCover = auction.bid_to_cover_ratio ? parseFloat(auction.bid_to_cover_ratio) : null;
                const highYield = auction.high_yield ? parseFloat(auction.high_yield) : null;
                const totalTendered = auction.total_tendered ? parseFloat(auction.total_tendered) : null;
                const totalAccepted = auction.total_accepted ? parseFloat(auction.total_accepted) : null;

                await fiscalRepository.upsertAuctionData(
                    auction.auction_date,
                    auction.security_type,
                    auction.security_term,
                    auction.cusip,
                    bidToCover,
                    highYield,
                    totalTendered,
                    totalAccepted
                );
                successCount++;
            } catch (err) {
                console.error(`Fehler beim Upsert für Auktion am ${auction.auction_date} (${auction.security_term}):`, err.message);
                errorCount++;
            }
        }

        console.log('Fiscal Backfill erfolgreich beendet!');
        console.log(`Erfolgreiche Inserts/Updates: ${successCount}`);
        console.log(`Fehlgeschlagene Inserts: ${errorCount}`);

    } catch (error) {
        console.error('Kritischer Fehler im Fiscal Backfill-Skript:', error);
        process.exit(1);
    }
}

runFiscalBackfill();