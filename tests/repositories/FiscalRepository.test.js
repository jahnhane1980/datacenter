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
            upsert: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            not: vi.fn().mockReturnThis(),
            update: vi.fn().mockReturnThis()
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
    describe('getHistoricalAuctionStats', () => {
        it('should return historical stats correctly', async () => {
            const mockData = [{ auction_date: '2026-06-01' }, { auction_date: '2026-05-01' }];
            mockSupabaseClient.from().limit.mockResolvedValue({ data: mockData, error: null });

            const result = await repository.getHistoricalAuctionStats('10-Year', 2);

            expect(mockSupabaseClient.from().select).toHaveBeenCalledWith('auction_date, bid_to_cover_ratio, high_yield, primary_dealer_accepted, direct_bidder_accepted, indirect_bidder_accepted, total_accepted');
            expect(mockSupabaseClient.from().eq).toHaveBeenCalledWith('security_term', '10-Year');
            expect(mockSupabaseClient.from().order).toHaveBeenCalledWith('auction_date', { ascending: false });
            expect(mockSupabaseClient.from().limit).toHaveBeenCalledWith(2);
            expect(result).toEqual(mockData);
        });

        it('should throw an error if db fails', async () => {
            mockSupabaseClient.from().limit.mockResolvedValue({ data: null, error: { message: 'DB Error' } });

            await expect(repository.getHistoricalAuctionStats('10-Year', 2)).rejects.toThrow(/DB Error/);
        });
    });

    describe('getAuctionsByCusips', () => {
        it('should return empty array if cusips is empty', async () => {
            const result = await repository.getAuctionsByCusips([]);
            expect(result).toEqual([]);
            expect(mockSupabaseClient.from).not.toHaveBeenCalled();
        });

        it('should return data if db succeeds', async () => {
            mockSupabaseClient.from().in.mockResolvedValue({ data: [{ cusip: 'A1' }], error: null });
            const result = await repository.getAuctionsByCusips(['A1']);
            expect(mockSupabaseClient.from().in).toHaveBeenCalledWith('cusip', ['A1']);
            expect(result).toEqual([{ cusip: 'A1' }]);
        });

        it('should throw error if db fails', async () => {
            mockSupabaseClient.from().in.mockResolvedValue({ data: null, error: { message: 'DB Error' } });
            await expect(repository.getAuctionsByCusips(['A1'])).rejects.toThrow(/DB Error/);
        });
    });

    describe('getAuctionsWithoutTail', () => {
        it('should return data if db succeeds', async () => {
            mockSupabaseClient.from().not.mockResolvedValue({ data: [{ cusip: 'A1' }], error: null });
            const result = await repository.getAuctionsWithoutTail();
            expect(mockSupabaseClient.from().is).toHaveBeenCalledWith('proxy_tail', null);
            expect(mockSupabaseClient.from().not).toHaveBeenCalledWith('high_yield', 'is', null);
            expect(result).toEqual([{ cusip: 'A1' }]);
        });

        it('should throw error if db fails', async () => {
            mockSupabaseClient.from().not.mockResolvedValue({ data: null, error: { message: 'DB Error' } });
            await expect(repository.getAuctionsWithoutTail()).rejects.toThrow(/DB Error/);
        });
    });

    describe('getRecentBillShare', () => {
        it('should calculate correct share', async () => {
            const mockData = [
                { security_type: 'Bill', total_accepted: 200 },
                { security_type: 'Note', total_accepted: 300 }
            ];
            mockSupabaseClient.from().limit.mockResolvedValue({ data: mockData, error: null });
            
            const result = await repository.getRecentBillShare();
            // Total = 500. Bills = 200. Share = 40%
            expect(result).toBe(40);
        });

        it('should return 0 if no data', async () => {
            mockSupabaseClient.from().limit.mockResolvedValue({ data: [], error: null });
            const result = await repository.getRecentBillShare();
            expect(result).toBe(0);
        });

        it('should throw error if db fails', async () => {
            mockSupabaseClient.from().limit.mockResolvedValue({ data: null, error: { message: 'DB Error' } });
            await expect(repository.getRecentBillShare()).rejects.toThrow(/DB Error/);
        });
    });

    describe('updateAuctionTail', () => {
        it('should update correctly', async () => {
            mockSupabaseClient.from().eq.mockResolvedValue({ error: null });
            await repository.updateAuctionTail('C1', 4.5, 0.1);
            expect(mockSupabaseClient.from().update).toHaveBeenCalledWith({
                secondary_market_yield: 4.5,
                proxy_tail: 0.1
            });
            expect(mockSupabaseClient.from().eq).toHaveBeenCalledWith('cusip', 'C1');
        });

        it('should throw error if db fails', async () => {
            mockSupabaseClient.from().eq.mockResolvedValue({ error: { message: 'DB Error' } });
            await expect(repository.updateAuctionTail('C1', 4.5, 0.1)).rejects.toThrow(/DB Error/);
        });
    });
});
