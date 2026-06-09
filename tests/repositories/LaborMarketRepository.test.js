import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLaborMarketRepository } from '../../src/repositories/LaborMarketRepository.js';

describe('LaborMarketRepository', () => {
    let mockSupabaseClient;
    let repository;

    beforeEach(() => {
        const queryBuilder = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            single: vi.fn().mockReturnThis(),
            upsert: vi.fn().mockReturnThis()
        };

        mockSupabaseClient = {
            from: vi.fn().mockReturnValue(queryBuilder)
        };

        repository = createLaborMarketRepository(mockSupabaseClient);
    });

    describe('getSeries', () => {
        it('should return series', async () => {
            mockSupabaseClient.from().select.mockResolvedValue({ data: [{ id: 1 }], error: null });

            const result = await repository.getSeries();
            expect(mockSupabaseClient.from).toHaveBeenCalledWith('labor_market_series');
            expect(result).toEqual([{ id: 1 }]);
        });

        it('should throw error on failure', async () => {
            mockSupabaseClient.from().select.mockResolvedValue({ data: null, error: { message: 'DB Error' } });

            await expect(repository.getSeries()).rejects.toThrow(/DB Error/);
        });
    });

    describe('getLatestDate', () => {
        it('should return date if data is found', async () => {
            mockSupabaseClient.from().single.mockResolvedValue({ data: { data_period: '2026-06-08' }, error: null });

            const result = await repository.getLatestDate(1);
            expect(mockSupabaseClient.from().eq).toHaveBeenCalledWith('series_id', 1);
            expect(result).toBe('2026-06-08');
        });

        it('should return null if PGRST116 (not found)', async () => {
            mockSupabaseClient.from().single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });

            const result = await repository.getLatestDate(1);
            expect(result).toBeNull();
        });

        it('should throw error on other DB failure', async () => {
            mockSupabaseClient.from().single.mockResolvedValue({ data: null, error: { message: 'DB Failed' } });

            await expect(repository.getLatestDate(1)).rejects.toThrow(/DB Failed/);
        });
    });

    describe('upsertDataPoint', () => {
        it('should upsert correctly', async () => {
            mockSupabaseClient.from().upsert.mockResolvedValue({ error: null });

            await repository.upsertDataPoint(1, '2026-05-01', '2026-06-08', 500, true);

            expect(mockSupabaseClient.from).toHaveBeenCalledWith('labor_market_data_points');
            expect(mockSupabaseClient.from().upsert).toHaveBeenCalledWith(
                { series_id: 1, data_period: '2026-05-01', release_date: '2026-06-08', value: 500, is_preliminary: true },
                { onConflict: 'series_id, data_period' }
            );
        });

        it('should throw error on failure', async () => {
            mockSupabaseClient.from().upsert.mockResolvedValue({ error: { message: 'DB Error' } });

            await expect(repository.upsertDataPoint(1, '2026-05-01', '2026-06-08', 500, true)).rejects.toThrow(/DB Error/);
        });
    });
});
