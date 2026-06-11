import { NotificationService } from '../services/NotificationService.js';
import { LLMService } from '../services/LLMService.js';
import { createPacingManager } from '../managers/PacingManager.js';
import { createFiscalRepository } from '../repositories/FiscalRepository.js';
import { buildTreasuryAuctionPrompt } from '../prompts/TreasuryAuctionPrompt.js';

export class TreasuryAuctionAction {
    constructor(supabaseClient) {
        this.notificationService = new NotificationService();
        this.llmService = new LLMService(createPacingManager());
        this.fiscalRepo = createFiscalRepository(supabaseClient);
    }

    async handle(event) {
        const payload = event.details;
        console.log(`   Verarbeite TreasuryAuctionAction für ${payload.security_term} vom ${payload.auction_date}...`);

        let history = [];
        try {
            history = await this.fiscalRepo.getHistoricalAuctionStats(payload.security_term, 6);
        } catch (error) {
            console.error('   [TreasuryAuctionAction] Fehler beim Laden der Historie:', error.message);
        }

        const total = payload.total_accepted || 1;
        const auctionData = {
            ...payload,
            primary_pct: ((payload.primary_dealer_accepted || 0) / total) * 100,
            direct_pct: ((payload.direct_bidder_accepted || 0) / total) * 100,
            indirect_pct: ((payload.indirect_bidder_accepted || 0) / total) * 100,
            high_yield: payload.high_yield || 0,
            bid_to_cover_ratio: payload.bid_to_cover_ratio || 0
        };

        const historyStats = {
            avgBtc: 0,
            avgYield: 0,
            avgPrimary: 0,
            avgDirect: 0,
            avgIndirect: 0
        };

        if (history.length > 0) {
            let sumBtc = 0, sumYield = 0, sumPrimary = 0, sumDirect = 0, sumIndirect = 0;
            let validBtc = 0, validYield = 0, validAlloc = 0;

            for (const h of history) {
                if (h.bid_to_cover_ratio) { sumBtc += h.bid_to_cover_ratio; validBtc++; }
                if (h.high_yield) { sumYield += h.high_yield; validYield++; }
                
                if (h.total_accepted) {
                    sumPrimary += ((h.primary_dealer_accepted || 0) / h.total_accepted) * 100;
                    sumDirect += ((h.direct_bidder_accepted || 0) / h.total_accepted) * 100;
                    sumIndirect += ((h.indirect_bidder_accepted || 0) / h.total_accepted) * 100;
                    validAlloc++;
                }
            }

            historyStats.avgBtc = validBtc > 0 ? sumBtc / validBtc : auctionData.bid_to_cover_ratio;
            historyStats.avgYield = validYield > 0 ? sumYield / validYield : auctionData.high_yield;
            historyStats.avgPrimary = validAlloc > 0 ? sumPrimary / validAlloc : auctionData.primary_pct;
            historyStats.avgDirect = validAlloc > 0 ? sumDirect / validAlloc : auctionData.direct_pct;
            historyStats.avgIndirect = validAlloc > 0 ? sumIndirect / validAlloc : auctionData.indirect_pct;
        } else {
            historyStats.avgBtc = auctionData.bid_to_cover_ratio;
            historyStats.avgYield = auctionData.high_yield;
            historyStats.avgPrimary = auctionData.primary_pct;
            historyStats.avgDirect = auctionData.direct_pct;
            historyStats.avgIndirect = auctionData.indirect_pct;
        }

        const { systemPrompt, userPrompt } = buildTreasuryAuctionPrompt(auctionData, historyStats);
        
        let llmResponse = '';
        try {
            llmResponse = await this.llmService._queryGroq(systemPrompt, userPrompt, false, 300, 10000);
        } catch (error) {
            console.error('   [TreasuryAuctionAction] Fehler beim LLM-Aufruf:', error.message);
            llmResponse = `Fehler bei der LLM-Analyse: ${error.message}`;
        }

        const subject = `Treasury Auktion: ${payload.security_term}`;
        await this.notificationService.send(subject, llmResponse);
    }
}
