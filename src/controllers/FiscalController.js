import { TREASURY_TYPES } from '../services/FiscalService.js';
import { BaseController } from '../core/BaseController.js';
import { createYahooService, TREASURY_YIELD_MAPPING } from '../services/YahooService.js';

export class FiscalController extends BaseController {
    /**
     * @param {Object} fiscalRepo 
     * @param {Object} fiscalService 
     */
    constructor(fiscalRepo, fiscalService, pacingManager = null) {
        super('FiscalController', pacingManager);
        this.fiscalRepo = fiscalRepo;
        this.fiscalService = fiscalService;
    }

    async _processAuctions(allAuctions) {
        let successCount = 0;
        let errorCount = 0;
        const yahooService = createYahooService();

        // 1. Identifiziere alle Auktionen, die "gefüllt" sind (total_accepted vorhanden)
        const filledAuctions = allAuctions.filter(a => a.total_accepted);
        const cusipsToCheck = filledAuctions.map(a => a.cusip).filter(Boolean);
        
        // 2. Hole den aktuellen DB-Zustand dieser Auktionen VOR dem Upsert
        let dbAuctionsMap = new Map();
        if (cusipsToCheck.length > 0 && this.fiscalRepo.getAuctionsByCusips) {
            try {
                const dbAuctions = await this.fiscalRepo.getAuctionsByCusips(cusipsToCheck);
                dbAuctionsMap = new Map(dbAuctions.map(a => [a.cusip, a]));
            } catch (err) {
                console.error('Fehler beim Prüfen des vorherigen Auktions-Status:', err.message);
            }
        }

        // Benötigen EventBus nur, wenn wir Events werfen
        const { EventBus } = await import('../core/EventBus.js').catch((err) => {
            console.error('Konnte EventBus nicht importieren:', err.message);
            return { EventBus: null };
        });

        await this.processItemsSafely(allAuctions, (a) => a.cusip || a.auction_date, async (auction) => {
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

                // 3. Prüfe, ob die Auktion gerade ERSTMALS ausgefüllt wurde
                if (totalAccepted && auction.cusip) {
                    const oldAuction = dbAuctionsMap.get(auction.cusip);
                    const wasEmptyBefore = !oldAuction || oldAuction.total_accepted === null;

                    if (wasEmptyBefore) {
                        let secondaryYield = null;
                        let proxyTail = null;

                        const ticker = TREASURY_YIELD_MAPPING[auction.security_term];
                        if (ticker && highYield !== null) {
                            secondaryYield = await yahooService.fetchYieldForDate(ticker, auction.auction_date);
                            if (secondaryYield !== null) {
                                proxyTail = highYield - secondaryYield;
                                await this.fiscalRepo.updateAuctionTail(auction.cusip, secondaryYield, proxyTail);
                            }
                        }

                        if (EventBus) {
                            EventBus.emit('FiscalController', 'treasury_auction_filled', {
                                cusip: auction.cusip,
                                security_type: auction.security_type,
                                security_term: auction.security_term,
                                auction_date: auction.auction_date,
                                total_accepted: totalAccepted,
                                bid_to_cover_ratio: bidToCover,
                                high_yield: highYield,
                                primary_dealer_accepted: primaryDealerAccepted,
                                direct_bidder_accepted: directBidderAccepted,
                                indirect_bidder_accepted: indirectBidderAccepted,
                                secondary_market_yield: secondaryYield,
                                proxy_tail: proxyTail
                            });
                        }
                    }
                }

                successCount++;
            } catch (err) {
                console.error(`Fehler beim Upsert für Auktion am ${auction.auction_date} (${auction.security_term}):`, err.message);
                errorCount++;
            }
        });
        return { successCount, errorCount };
    }

    async runDailySync() {
        await this.executeJob('Fiscal Data (Treasury Auctions) Sync', async () => {
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

            console.log(`Erfolgreiche Inserts/Updates: ${successCount}`);
            console.log(`Fehlgeschlagene Inserts: ${errorCount}`);
        });
    }

    async runBackfill() {
        await this.executeJob('Fiscal Data (Treasury Auctions) Backfill', async () => {
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

            console.log(`Erfolgreiche Inserts/Updates: ${successCount}`);
            console.log(`Fehlgeschlagene Inserts: ${errorCount}`);
        });
    }

    async runTailBackfill() {
        await this.executeJob('Fiscal Tail Backfill', async () => {
            console.log('Lade Auktionen ohne berechneten Tail...');
            const auctions = await this.fiscalRepo.getAuctionsWithoutTail();
            
            if (auctions.length === 0) {
                console.log('Keine Auktionen für Tail Backfill gefunden.');
                return;
            }

            console.log(`${auctions.length} Auktionen gefunden. Starte Abruf von Yahoo Finance...`);
            
            const yahooService = createYahooService();
            let successCount = 0;
            let skipCount = 0;
            let errorCount = 0;

            await this.processItemsSafely(auctions, (a) => a.cusip, async (auction) => {
                const ticker = TREASURY_YIELD_MAPPING[auction.security_term];
                if (!ticker) {
                    // Ignoriere nicht unterstützte Laufzeiten (z.B. 2-Year, 4-Week)
                    skipCount++;
                    return;
                }

                try {
                    const secondaryYield = await yahooService.fetchYieldForDate(ticker, auction.auction_date);
                    
                    if (secondaryYield !== null) {
                        const highYield = parseFloat(auction.high_yield);
                        // Proxy Tail: Differenz zwischen High Yield bei Auktion und Sekundärmarktrendite
                        const proxyTail = highYield - secondaryYield;
                        
                        await this.fiscalRepo.updateAuctionTail(auction.cusip, secondaryYield, proxyTail);
                        successCount++;
                    } else {
                        // z.B. Wochenende, Feiertag oder keine Daten bei Yahoo
                        skipCount++;
                    }
                } catch (err) {
                    console.error(`Fehler bei CUSIP ${auction.cusip}: ${err.message}`);
                    errorCount++;
                }
            });

            console.log(`Tail Backfill beendet. Erfolgreich: ${successCount}, Übersprungen: ${skipCount}, Fehler: ${errorCount}`);
        });
    }
}
