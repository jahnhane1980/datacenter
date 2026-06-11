import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TreasuryAuctionAction } from '../../src/actions/TreasuryAuctionAction.js';
import { NotificationService } from '../../src/services/NotificationService.js';
import { LLMService } from '../../src/services/LLMService.js';
import { createFiscalRepository } from '../../src/repositories/FiscalRepository.js';

vi.mock('../../src/services/NotificationService.js');
vi.mock('../../src/services/LLMService.js');
vi.mock('../../src/managers/PacingManager.js', () => ({
    createPacingManager: vi.fn()
}));
vi.mock('../../src/repositories/FiscalRepository.js');

describe('TreasuryAuctionAction', () => {
    let action;
    let mockSupabase;
    let mockRepo;
    let mockLlm;
    let mockNotification;

    beforeEach(() => {
        vi.clearAllMocks();

        // Mocks setup
        mockRepo = {
            getHistoricalAuctionStats: vi.fn()
        };
        createFiscalRepository.mockReturnValue(mockRepo);

        mockLlm = {
            _queryGroq: vi.fn().mockResolvedValue('Super Auktion!')
        };
        LLMService.mockImplementation(function() { return mockLlm; });

        mockNotification = {
            send: vi.fn().mockResolvedValue()
        };
        NotificationService.mockImplementation(function() { return mockNotification; });

        mockSupabase = {}; // Dummy-Objekt

        action = new TreasuryAuctionAction(mockSupabase);
    });

    it('should handle treasury_auction_filled event correctly with history', async () => {
        const event = {
            type: 'treasury_auction_filled',
            details: {
                security_term: '10-Year',
                auction_date: '2026-06-11',
                total_accepted: 1000,
                primary_dealer_accepted: 200,
                direct_bidder_accepted: 300,
                indirect_bidder_accepted: 500,
                high_yield: 4.5,
                bid_to_cover_ratio: 2.5
            }
        };

        const mockHistory = [
            {
                bid_to_cover_ratio: 2.4,
                high_yield: 4.6,
                total_accepted: 1000,
                primary_dealer_accepted: 250,
                direct_bidder_accepted: 250,
                indirect_bidder_accepted: 500
            },
            {
                // Missing fields to cover falsy branches
                bid_to_cover_ratio: null,
                high_yield: null,
                total_accepted: null
            },
            {
                // total_accepted present but missing allocations to cover `|| 0` branches
                bid_to_cover_ratio: 2.0,
                high_yield: 4.0,
                total_accepted: 1000
            }
        ];
        
        mockRepo.getHistoricalAuctionStats.mockResolvedValue(mockHistory);

        await action.handle(event);

        expect(mockRepo.getHistoricalAuctionStats).toHaveBeenCalledWith('10-Year', 6);
        expect(mockLlm._queryGroq).toHaveBeenCalled();
        expect(mockNotification.send).toHaveBeenCalledWith('Treasury Auktion: 10-Year', 'Super Auktion!');
    });

    it('should handle treasury_auction_filled event correctly without history', async () => {
        const event = {
            type: 'treasury_auction_filled',
            details: {
                security_term: '4-Week',
                auction_date: '2026-06-11',
                total_accepted: 100,
                primary_dealer_accepted: 20,
                direct_bidder_accepted: 30,
                indirect_bidder_accepted: 50,
                high_yield: 5.1,
                bid_to_cover_ratio: 3.1
            }
        };
        
        mockRepo.getHistoricalAuctionStats.mockResolvedValue([]); // Keine Historie

        await action.handle(event);

        expect(mockRepo.getHistoricalAuctionStats).toHaveBeenCalledWith('4-Week', 6);
        expect(mockLlm._queryGroq).toHaveBeenCalled();
        expect(mockNotification.send).toHaveBeenCalledWith('Treasury Auktion: 4-Week', 'Super Auktion!');
    });

    it('should handle LLM errors gracefully', async () => {
        const event = {
            type: 'treasury_auction_filled',
            details: { security_term: '10-Year' }
        };
        
        mockRepo.getHistoricalAuctionStats.mockResolvedValue([]);
        mockLlm._queryGroq.mockRejectedValue(new Error('LLM Down'));

        await action.handle(event);

        expect(mockNotification.send).toHaveBeenCalledWith('Treasury Auktion: 10-Year', 'Fehler bei der LLM-Analyse: LLM Down');
    });

    it('should handle DB errors gracefully', async () => {
        const event = {
            type: 'treasury_auction_filled',
            details: { security_term: '10-Year' }
        };
        
        mockRepo.getHistoricalAuctionStats.mockRejectedValue(new Error('DB Offline'));

        await action.handle(event);

        expect(mockLlm._queryGroq).toHaveBeenCalled(); // Sollte trotzdem LLM aufrufen (mit Fallback-Stats)
        expect(mockNotification.send).toHaveBeenCalled();
    });
});
