import { TREASURY_TYPES } from '../services/FiscalService.js';

export class FiscalController {
    /**
     * @param {Object} fiscalRepo 
     * @param {Object} fiscalService 
     */
    constructor(fiscalRepo, fiscalService) {
        this.fiscalRepo = fiscalRepo;
        this.fiscalService = fiscalService;
    }

    async _processAuctions(allAuctions) {
        let successCount = 0;
        let errorCount = 0;

        for (const auction of allAuctions) {
            try {
                const bidToCover = auction.bid_to_cover_ratio ? parseFloat(auction.bid_to_cover_ratio) : null;
                const highYield = auction.high_yield ? parseFloat(auction.high_yield) : null;
                const offeringAmount = auction.offering_amount ? parseFloat(auction.offering_amount) : null;
                const totalTendered = auction.total_tendered ? parseFloat(auction.total_tendered) : null;
                const totalAccepted = auction.total_accepted ? parseFloat(auction.total_accepted) : null;
                
                const primaryDealerAccepted = auction.primary_dealer_accepted ? parseFloat(auction.primary_dealer_accepted) : null;
                const directBidderAccepted = auction.direct_bidder_accepted ? parseFloat(auction.direct_bidder_accepted) : null;
                const indirectBidderAccepted = auction.indirect_bidder_accepted ? parseFloat(auction.indirect_bidder_accepted) : null;

                const issueDate = auction.issue_date || null;
                const maturityDate = auction.maturity_date || null;

                await this.fiscalRepo.upsertAuctionData(
                    auction.auction_date,
                    issueDate,
                    maturityDate,
                    auction.security_type,
                    auction.security_term,
                    auction.cusip,
                    bidToCover,
                    highYield,
                    offeringAmount,
                    totalTendered,
                    totalAccepted,
                    primaryDealerAccepted,
                    directBidderAccepted,
                    indirectBidderAccepted
                );
                successCount++;
            } catch (err) {
                console.error(`Fehler beim Upsert für Auktion am ${auction.auction_date} (${auction.security_term}):`, err.message);
                errorCount++;
            }
        }
        return { successCount, errorCount };
    }

    async runDailySync() {
        console.log('Starte täglichen Fiscal Data (Treasury Auctions) Sync...');

        const daysBack = 14;
        console.log(`Hole Auktionsdaten der letzten ${daysBack} Tage...`);

        const [billsData, notesData, bondsData] = await Promise.all([
            this.fiscalService.getRecentAuctions(TREASURY_TYPES.BILL, daysBack),
            this.fiscalService.getRecentAuctions(TREASURY_TYPES.NOTE, daysBack),
            this.fiscalService.getRecentAuctions(TREASURY_TYPES.BOND, daysBack)
        ]);

        const allAuctions = [...billsData, ...notesData, ...bondsData];
        
        console.log(`${allAuctions.length} Auktionen gefunden. Starte Datenaufbereitung und Upsert...`);

        const { successCount, errorCount } = await this._processAuctions(allAuctions);

        console.log('Fiscal Sync erfolgreich beendet!');
        console.log(`Erfolgreiche Inserts/Updates: ${successCount}`);
        console.log(`Fehlgeschlagene Inserts: ${errorCount}`);
    }

    async runBackfill() {
        console.log('Starte Fiscal Data (Treasury Auctions) Backfill...');

        const startDate = '2022-01-01'; 
        const BACKFILL_LIMIT = 2000; 

        console.log(`Hole Auktionsdaten ab dem ${startDate} (Limit pro Kategorie: ${BACKFILL_LIMIT})...`);

        const [billsData, notesData, bondsData] = await Promise.all([
            this.fiscalService.fetchAuctions(TREASURY_TYPES.BILL, startDate, BACKFILL_LIMIT),
            this.fiscalService.fetchAuctions(TREASURY_TYPES.NOTE, startDate, BACKFILL_LIMIT),
            this.fiscalService.fetchAuctions(TREASURY_TYPES.BOND, startDate, BACKFILL_LIMIT)
        ]);

        const allAuctions = [...billsData, ...notesData, ...bondsData];
        
        console.log(`${allAuctions.length} historische Auktionen gefunden. Starte Datenaufbereitung und Upsert...`);

        const { successCount, errorCount } = await this._processAuctions(allAuctions);

        console.log('Fiscal Backfill erfolgreich beendet!');
        console.log(`Erfolgreiche Inserts/Updates: ${successCount}`);
        console.log(`Fehlgeschlagene Inserts: ${errorCount}`);
    }
}
