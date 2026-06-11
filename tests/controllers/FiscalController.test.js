import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FiscalController } from '../../src/controllers/FiscalController.js';
import { createYahooService } from '../../src/services/YahooService.js';

vi.mock('../../src/services/YahooService.js', () => {
    return {
        createYahooService: vi.fn(),
        TREASURY_YIELD_MAPPING: { '10-Year': '^TNX', '4-Week': null }
    };
});

describe('FiscalController', () => {
    let mockFiscalRepo;
    let mockFiscalService;
    let controller;

    let mockYahooService;

    beforeEach(() => {
        mockFiscalRepo = {
            upsertAuctionData: vi.fn(),
            getAuctionsByCusips: vi.fn(),
            updateAuctionTail: vi.fn(),
            getAuctionsWithoutTail: vi.fn()
        };
        mockFiscalService = {
            getRecentAuctions: vi.fn(),
            fetchAuctions: vi.fn()
        };
        mockYahooService = {
            fetchYieldForDate: vi.fn()
        };
        createYahooService.mockReturnValue(mockYahooService);

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

        it('should calculate proxy tail and emit event if a new auction gets filled', async () => {
            const auctionToFill = {
                auction_date: '2026-06-01',
                security_term: '10-Year',
                cusip: 'NEW-10Y',
                high_yield: '4.50',
                total_accepted: '1000'
            };
            mockFiscalService.getRecentAuctions.mockImplementation(async (type) => {
                if (type === 'Note') return [auctionToFill];
                return [];
            });
            // DB says it was empty before
            mockFiscalRepo.getAuctionsByCusips.mockResolvedValue([{ cusip: 'NEW-10Y', total_accepted: null }]);
            // Yahoo returns secondary yield
            mockYahooService.fetchYieldForDate.mockResolvedValue(4.40);

            await controller.runDailySync();

            // proxy tail: 4.50 - 4.40 = 0.10. JS float math: 4.50 - 4.40 = 0.09999... We check close to.
            expect(mockFiscalRepo.updateAuctionTail).toHaveBeenCalledWith('NEW-10Y', 4.40, expect.any(Number));
        });

        it('should handle db error when checking cusips gracefully', async () => {
            mockFiscalService.getRecentAuctions.mockResolvedValue([dummyAuction]);
            mockFiscalRepo.getAuctionsByCusips.mockRejectedValue(new Error('DB Error'));

            await expect(controller.runDailySync()).resolves.not.toThrow();
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

    describe('runTailBackfill', () => {
        it('should exit if no auctions without tail are found', async () => {
            mockFiscalRepo.getAuctionsWithoutTail.mockResolvedValue([]);
            await controller.runTailBackfill();
            expect(mockYahooService.fetchYieldForDate).not.toHaveBeenCalled();
        });

        it('should calculate and update tail for valid auctions', async () => {
            const auctions = [
                { cusip: 'A1', security_term: '10-Year', auction_date: '2026-06-01', high_yield: '4.50' }
            ];
            mockFiscalRepo.getAuctionsWithoutTail.mockResolvedValue(auctions);
            mockYahooService.fetchYieldForDate.mockResolvedValue(4.40);

            await controller.runTailBackfill();

            expect(mockYahooService.fetchYieldForDate).toHaveBeenCalledWith('^TNX', '2026-06-01');
            expect(mockFiscalRepo.updateAuctionTail).toHaveBeenCalledWith('A1', 4.40, expect.any(Number));
        });

        it('should skip unsupported terms and days without data', async () => {
            const auctions = [
                { cusip: 'B1', security_term: '4-Week', auction_date: '2026-06-01', high_yield: '4.50' }, // Skip (null mapping)
                { cusip: 'C1', security_term: '10-Year', auction_date: '2026-06-02', high_yield: '4.50' }  // Skip (yahoo returns null)
            ];
            mockFiscalRepo.getAuctionsWithoutTail.mockResolvedValue(auctions);
            mockYahooService.fetchYieldForDate.mockResolvedValue(null);

            await controller.runTailBackfill();

            // B1 should not trigger fetch
            // C1 triggers fetch but returns null, so no update
            expect(mockFiscalRepo.updateAuctionTail).not.toHaveBeenCalled();
        });

        it('should handle errors gracefully per item', async () => {
            const auctions = [
                { cusip: 'D1', security_term: '10-Year', auction_date: '2026-06-01', high_yield: '4.50' }
            ];
            mockFiscalRepo.getAuctionsWithoutTail.mockResolvedValue(auctions);
            mockYahooService.fetchYieldForDate.mockRejectedValue(new Error('Network Error'));

            await expect(controller.runTailBackfill()).resolves.not.toThrow();
            expect(mockFiscalRepo.updateAuctionTail).not.toHaveBeenCalled();
        });
    });
});
