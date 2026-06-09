import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFiscalRepository } from '../../src/repositories/FiscalRepository.js';

describe('FiscalRepository', () => {
    let mockSupabaseClient;
    let repository;

    beforeEach(() => {
        const queryBuilder = {
            select: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            upsert: vi.fn().mockReturnThis()
        };

        mockSupabaseClient = {
            from: vi.fn().mockReturnValue(queryBuilder)
        };

        repository = createFiscalRepository(mockSupabaseClient);
    });

    describe('upsertAuctionData', () => {
        it('should upsert auction data correctly', async () => {
            mockSupabaseClient.from().upsert.mockResolvedValue({ error: null });

            await repository.upsertAuctionData('2026-06-08', '2026-06-10', '2026-07-10', 'Bill', '4-Week', '123456789', 3.5, 5.2, 50000, 150000, 50000, 20000, 10000, 20000);

            expect(mockSupabaseClient.from).toHaveBeenCalledWith('treasury_auctions');
            expect(mockSupabaseClient.from().upsert).toHaveBeenCalledWith(
                { 
                    auction_date: '2026-06-08',
                    issue_date: '2026-06-10',
                    maturity_date: '2026-07-10',
                    security_type: 'Bill',
                    security_term: '4-Week',
                    cusip: '123456789',
                    bid_to_cover_ratio: 3.5,
                    high_yield: 5.2,
                    offering_amount: 50000,
                    total_tendered: 150000,
                    total_accepted: 50000,
                    primary_dealer_accepted: 20000,
                    direct_bidder_accepted: 10000,
                    indirect_bidder_accepted: 20000
                }, 
                { onConflict: 'cusip' }
            );
        });

        it('should throw an error if upsert fails', async () => {
            mockSupabaseClient.from().upsert.mockResolvedValue({ error: { message: 'DB Error' } });

            await expect(repository.upsertAuctionData('2026-06-08', '2026-06-10', '2026-07-10', 'Bill', '4-Week', '123456789', 3.5, 5.2, 50000, 150000, 50000, 20000, 10000, 20000)).rejects.toThrow(/DB Error/);
        });
    });

    describe('getLatestAuctionDate', () => {
        it('should return date if data is found', async () => {
            mockSupabaseClient.from().limit.mockResolvedValue({ data: [{ auction_date: '2026-06-08' }], error: null });

            const result = await repository.getLatestAuctionDate();

            expect(mockSupabaseClient.from().select).toHaveBeenCalledWith('auction_date');
            expect(result).toBe('2026-06-08');
        });

        it('should return null if no data is found', async () => {
            mockSupabaseClient.from().limit.mockResolvedValue({ data: [], error: null });

            const result = await repository.getLatestAuctionDate();

            expect(result).toBeNull();
        });

        it('should return null if data is null', async () => {
            mockSupabaseClient.from().limit.mockResolvedValue({ data: null, error: null });

            const result = await repository.getLatestAuctionDate();

            expect(result).toBeNull();
        });

        it('should throw error if db fails', async () => {
            mockSupabaseClient.from().limit.mockResolvedValue({ data: null, error: { message: 'DB Failed' } });

            await expect(repository.getLatestAuctionDate()).rejects.toThrow(/DB Failed/);
        });
    });
});
