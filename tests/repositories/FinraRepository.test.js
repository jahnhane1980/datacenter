import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FinraRepository } from '../../src/repositories/FinraRepository.js';

describe('FinraRepository', () => {
    let mockSupabaseClient;
    let repository;

    beforeEach(() => {
        const queryBuilder = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            upsert: vi.fn().mockReturnThis()
        };

        mockSupabaseClient = {
            from: vi.fn().mockReturnValue(queryBuilder)
        };

        repository = new FinraRepository(mockSupabaseClient);
    });

    describe('upsertShortData', () => {
        it('should upsert correctly', async () => {
            mockSupabaseClient.from().upsert.mockResolvedValue({ error: null });

            await repository.upsertShortData(1, 1600000000, 100, 500);

            expect(mockSupabaseClient.from).toHaveBeenCalledWith('market_finra_short_volume');
            expect(mockSupabaseClient.from().upsert).toHaveBeenCalledWith(
                { ticker: 1, timestamp: 1600000000, short_volume: 100, total_volume: 500 },
                { onConflict: 'ticker,timestamp' }
            );
        });

        it('should throw error on failure', async () => {
            mockSupabaseClient.from().upsert.mockResolvedValue({ error: { message: 'DB Error' } });

            await expect(repository.upsertShortData(1, 1600000000, 100, 500)).rejects.toThrow(/DB Error/);
        });
    });

    describe('getLatestTimestamp', () => {
        it('should fetch latest timestamp for all tickers if no tickerId provided', async () => {
            mockSupabaseClient.from().limit.mockResolvedValue({ data: [{ timestamp: 1600000000 }], error: null });

            const result = await repository.getLatestTimestamp();

            expect(mockSupabaseClient.from().select).toHaveBeenCalledWith('timestamp');
            expect(mockSupabaseClient.from().eq).not.toHaveBeenCalled();
            expect(result).toBe(1600000000);
        });

        it('should fetch latest timestamp for specific ticker', async () => {
            mockSupabaseClient.from().limit.mockResolvedValue({ data: [{ timestamp: 1600000000 }], error: null });

            const result = await repository.getLatestTimestamp(1);

            expect(mockSupabaseClient.from().eq).toHaveBeenCalledWith('ticker', 1);
            expect(result).toBe(1600000000);
        });

        it('should return null if no data exists', async () => {
            mockSupabaseClient.from().limit.mockResolvedValue({ data: [], error: null });

            const result = await repository.getLatestTimestamp();
            expect(result).toBeNull();
        });

        it('should throw error on failure', async () => {
            mockSupabaseClient.from().limit.mockResolvedValue({ data: null, error: { message: 'DB Failed' } });

            await expect(repository.getLatestTimestamp()).rejects.toThrow(/DB Failed/);
        });
    });

    describe('getExistingMonths', () => {
        it('should return a set of formatted months', async () => {
            // timestamps: 2026-06-08 (1775606400), 2026-05-01 (1772409600)
            mockSupabaseClient.from().order.mockResolvedValue({ 
                data: [{ timestamp: 1775606400 }, { timestamp: 1772409600 }], 
                error: null 
            });

            const result = await repository.getExistingMonths();

            expect(mockSupabaseClient.from().select).toHaveBeenCalledWith('timestamp');
            expect(result.has('2026-04')).toBe(true);
            expect(result.has('2026-03')).toBe(true);
        });

        it('should return empty set if no data', async () => {
            mockSupabaseClient.from().order.mockResolvedValue({ data: [], error: null });

            const result = await repository.getExistingMonths();
            expect(result.size).toBe(0);
        });

        it('should throw error on failure', async () => {
            mockSupabaseClient.from().order.mockResolvedValue({ data: null, error: { message: 'DB Error' } });

            await expect(repository.getExistingMonths()).rejects.toThrow(/DB Error/);
        });
    });
});
