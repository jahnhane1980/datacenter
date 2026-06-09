import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CandleRepository } from '../../src/repositories/CandleRepository.js';

describe('CandleRepository', () => {
    let mockSupabaseClient;
    let repository;

    beforeEach(() => {
        const queryBuilder = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            single: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            upsert: vi.fn().mockReturnThis()
        };

        mockSupabaseClient = {
            from: vi.fn().mockReturnValue(queryBuilder)
        };

        repository = new CandleRepository(mockSupabaseClient);
    });

    describe('getLatestDailyTimestamp', () => {
        it('should return timestamp when data exists', async () => {
            const mockData = { timestamp: 1600000000 };
            mockSupabaseClient.from().single.mockResolvedValue({ data: mockData, error: null });

            const result = await repository.getLatestDailyTimestamp(1);
            expect(mockSupabaseClient.from).toHaveBeenCalledWith('market_daily_candles');
            expect(result).toBe(1600000000);
        });

        it('should return null when PGRST116 (not found) error occurs', async () => {
            mockSupabaseClient.from().single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });

            const result = await repository.getLatestDailyTimestamp(1);
            expect(result).toBeNull();
        });

        it('should throw error for other DB errors', async () => {
            mockSupabaseClient.from().single.mockResolvedValue({ data: null, error: { message: 'DB down' } });

            await expect(repository.getLatestDailyTimestamp(1)).rejects.toThrow(/DB down/);
        });
    });

    describe('getLatestM5Timestamp', () => {
        it('should return timestamp when data exists', async () => {
            const mockData = { timestamp: 1600000000 };
            mockSupabaseClient.from().single.mockResolvedValue({ data: mockData, error: null });

            const result = await repository.getLatestM5Timestamp(1);
            expect(mockSupabaseClient.from).toHaveBeenCalledWith('market_m5_candles');
            expect(result).toBe(1600000000);
        });

        it('should return null when PGRST116 (not found) error occurs', async () => {
            mockSupabaseClient.from().single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });

            const result = await repository.getLatestM5Timestamp(1);
            expect(result).toBeNull();
        });

        it('should throw error for other DB errors', async () => {
            mockSupabaseClient.from().single.mockResolvedValue({ data: null, error: { message: 'DB down' } });

            await expect(repository.getLatestM5Timestamp(1)).rejects.toThrow(/DB down/);
        });
    });

    describe('getDailyCandlesSince', () => {
        it('should return candles array', async () => {
            const mockData = [{ timestamp: 1600000000, close: 150 }];
            
            // Re-mock order specifically since it's the terminal call for this method
            mockSupabaseClient.from().order.mockResolvedValue({ data: mockData, error: null });

            const result = await repository.getDailyCandlesSince(1, 1500000000);
            expect(mockSupabaseClient.from).toHaveBeenCalledWith('market_daily_candles');
            expect(result).toEqual(mockData);
        });

        it('should throw error when db fails', async () => {
            mockSupabaseClient.from().order.mockResolvedValue({ data: null, error: { message: 'DB error' } });
            await expect(repository.getDailyCandlesSince(1, 1500000000)).rejects.toThrow(/DB error/);
        });
    });

    describe('upsertDailyCandles', () => {
        it('should do nothing if aggregates are empty', async () => {
            await repository.upsertDailyCandles(1, []);
            expect(mockSupabaseClient.from).not.toHaveBeenCalled();
        });

        it('should upsert correctly rounded data', async () => {
            mockSupabaseClient.from().upsert.mockResolvedValue({ error: null });

            const input = [{ t: 1600000000000, o: 1, h: 2, l: 0.5, c: 1.5, v: 100.5, vw: 1.25, n: 5.4 }];
            await repository.upsertDailyCandles(1, input);

            expect(mockSupabaseClient.from().upsert).toHaveBeenCalledWith([{
                ticker: 1,
                timestamp: 1600000000,
                open: 1,
                high: 2,
                low: 0.5,
                close: 1.5,
                volume: 101, // rounded
                vwap: 1.25,
                trades: 5 // rounded
            }], { onConflict: 'ticker, timestamp' });
        });

        it('should throw error on db failure', async () => {
            mockSupabaseClient.from().upsert.mockResolvedValue({ error: { message: 'Insert failed' } });
            await expect(repository.upsertDailyCandles(1, [{ t: 1 }])).rejects.toThrow(/Insert failed/);
        });
    });

    describe('upsertM5Candles', () => {
        it('should do nothing if aggregates are empty', async () => {
            await repository.upsertM5Candles(1, []);
            expect(mockSupabaseClient.from).not.toHaveBeenCalled();
        });

        it('should upsert correctly rounded data', async () => {
            mockSupabaseClient.from().upsert.mockResolvedValue({ error: null });

            const input = [{ t: 1600000000000, o: 1, h: 2, l: 0.5, c: 1.5 }];
            await repository.upsertM5Candles(1, input);

            expect(mockSupabaseClient.from().upsert).toHaveBeenCalledWith([{
                ticker: 1,
                timestamp: 1600000000,
                open: 1,
                high: 2,
                low: 0.5,
                close: 1.5,
                volume: 0,
                vwap: null,
                trades: null
            }], { onConflict: 'ticker, timestamp' });
        });
    });
});
