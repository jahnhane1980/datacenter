import 'dotenv/config';
import { createFiscalService, TREASURY_TYPES } from './src/services/FiscalService.js';
import { createFiscalRepository } from './src/repositories/FiscalRepository.js';

async function runFiscalSync() {
    console.log('Starte täglichen Fiscal Data (Treasury Auctions) Sync...');

    try {
        const fiscalService = createFiscalService();
        const fiscalRepository = createFiscalRepository();

        // Wir nutzen den Stateless-Ansatz und holen standardmäßig die letzten 14 Tage
        const daysBack = 14;
        console.log(`Hole Auktionsdaten der letzten ${daysBack} Tage...`);

        // Paralleles Abrufen aller generischen Wertpapier-Typen (umfasst alle Laufzeiten)
        const [billsData, notesData, bondsData] = await Promise.all([
            fiscalService.getRecentAuctions(TREASURY_TYPES.BILL, daysBack),
            fiscalService.getRecentAuctions(TREASURY_TYPES.NOTE, daysBack),
            fiscalService.getRecentAuctions(TREASURY_TYPES.BOND, daysBack)
        ]);

        // Führe alle Arrays zu einem zusammen für die Verarbeitung
        const allAuctions = [...billsData, ...notesData, ...bondsData];
        
        console.log(`${allAuctions.length} Auktionen gefunden. Starte Datenaufbereitung und Upsert...`);

        let successCount = 0;
        let errorCount = 0;

        for (const auction of allAuctions) {
            try {
                // Die API liefert Strings zurück, wir parsen sie sauber in numerische Werte
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

        console.log('Fiscal Sync erfolgreich beendet!');
        console.log(`Erfolgreiche Inserts/Updates: ${successCount}`);
        console.log(`Fehlgeschlagene Inserts: ${errorCount}`);

    } catch (error) {
        console.error('Kritischer Fehler im Fiscal Sync-Skript:', error);
        process.exit(1);
    }
}

runFiscalSync();