import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FiscalController } from '../../src/controllers/FiscalController.js';

describe('FiscalController', () => {
    let mockFiscalRepo;
    let mockFiscalService;
    let controller;

    beforeEach(() => {
        mockFiscalRepo = {
            upsertAuctionData: vi.fn()
        };
        mockFiscalService = {
            getRecentAuctions: vi.fn(),
            fetchAuctions: vi.fn()
        };

        controller = new FiscalController(mockFiscalRepo, mockFiscalService);
    });

    const dummyAuction = {
        auction_date: '2026-06-01',
        issue_date: '2026-06-05',
        maturity_date: '2026-12-05',
        security_type: 'Bill',
        security_term: '4-Week',
        cusip: '123456789',
        bid_to_cover_ratio: '2.5',
        high_yield: '5.2',
        offering_amount: '500000',
        total_tendered: '1250000',
        total_accepted: '500000',
        primary_dealer_accepted: '100000',
        direct_bidder_accepted: '200000',
        indirect_bidder_accepted: '200000'
    };

    describe('runDailySync', () => {
        it('should fetch and process daily auctions', async () => {
            mockFiscalService.getRecentAuctions.mockResolvedValue([dummyAuction]);

            await controller.runDailySync();

            expect(mockFiscalService.getRecentAuctions).toHaveBeenCalledTimes(3);
            expect(mockFiscalRepo.upsertAuctionData).toHaveBeenCalledWith(
                '2026-06-01', '2026-06-05', '2026-12-05', 'Bill', '4-Week', '123456789',
                2.5, 5.2, 500000, 1250000, 500000, 100000, 200000, 200000
            );
            expect(mockFiscalRepo.upsertAuctionData).toHaveBeenCalledTimes(3); // 1 per category mock
        });
    });

    describe('runBackfill', () => {
        it('should fetch and process backfill auctions', async () => {
            mockFiscalService.fetchAuctions.mockResolvedValue([dummyAuction]);

            await controller.runBackfill();

            expect(mockFiscalService.fetchAuctions).toHaveBeenCalledTimes(3);
            expect(mockFiscalRepo.upsertAuctionData).toHaveBeenCalledTimes(3);
        });

        it('should handle upsert errors gracefully', async () => {
            mockFiscalService.fetchAuctions.mockResolvedValue([dummyAuction]);
            mockFiscalRepo.upsertAuctionData.mockRejectedValue(new Error('DB Error'));

            // Sollte nicht crashen, nur loggen
            await expect(controller.runBackfill()).resolves.not.toThrow();
            expect(mockFiscalRepo.upsertAuctionData).toHaveBeenCalledTimes(3);
        });
    });
});
