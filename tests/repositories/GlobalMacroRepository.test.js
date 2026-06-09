import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGlobalMacroRepository } from '../../src/repositories/GlobalMacroRepository.js';

describe('GlobalMacroRepository', () => {
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

        repository = createGlobalMacroRepository(mockSupabaseClient);
    });

    describe('getDefinitions', () => {
        it('should return definitions', async () => {
            mockSupabaseClient.from().select.mockResolvedValue({ data: [{ id: 1 }], error: null });

            const result = await repository.getDefinitions();
            expect(mockSupabaseClient.from).toHaveBeenCalledWith('macro_global_indicator_definition');
            expect(result).toEqual([{ id: 1 }]);
        });

        it('should throw error on failure', async () => {
            mockSupabaseClient.from().select.mockResolvedValue({ data: null, error: { message: 'DB Error' } });

            await expect(repository.getDefinitions()).rejects.toThrow(/DB Error/);
        });
    });

    describe('getLatestGlobalDate', () => {
        it('should return date if data is found', async () => {
            mockSupabaseClient.from().single.mockResolvedValue({ data: { observation_date: '2026-06-08' }, error: null });

            const result = await repository.getLatestGlobalDate(1);
            expect(mockSupabaseClient.from().eq).toHaveBeenCalledWith('indicator_id', 1);
            expect(result).toBe('2026-06-08');
        });

        it('should return null if PGRST116 (not found)', async () => {
            mockSupabaseClient.from().single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });

            const result = await repository.getLatestGlobalDate(1);
            expect(result).toBeNull();
        });

        it('should throw error on other DB failure', async () => {
            mockSupabaseClient.from().single.mockResolvedValue({ data: null, error: { message: 'DB Failed' } });

            await expect(repository.getLatestGlobalDate(1)).rejects.toThrow(/DB Failed/);
        });
    });

    describe('upsertGlobalData', () => {
        it('should upsert correctly', async () => {
            mockSupabaseClient.from().upsert.mockResolvedValue({ error: null });

            await repository.upsertGlobalData(1, '2026-06-08', 50.5);

            expect(mockSupabaseClient.from).toHaveBeenCalledWith('macro_global_indicator_values');
            expect(mockSupabaseClient.from().upsert).toHaveBeenCalledWith(
                { indicator_id: 1, observation_date: '2026-06-08', raw_value: 50.5 },
                { onConflict: 'indicator_id, observation_date' }
            );
        });

        it('should throw error on failure', async () => {
            mockSupabaseClient.from().upsert.mockResolvedValue({ error: { message: 'DB Error' } });

            await expect(repository.upsertGlobalData(1, '2026-06-08', 50.5)).rejects.toThrow(/DB Error/);
        });
    });

    describe('getLatestFxDate', () => {
        it('should return date if data is found', async () => {
            mockSupabaseClient.from().single.mockResolvedValue({ data: { observation_date: '2026-06-08' }, error: null });

            const result = await repository.getLatestFxDate('EURUSD');
            expect(mockSupabaseClient.from().eq).toHaveBeenCalledWith('currency_pair', 'EURUSD');
            expect(result).toBe('2026-06-08');
        });

        it('should return null if PGRST116 (not found)', async () => {
            mockSupabaseClient.from().single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });

            const result = await repository.getLatestFxDate('EURUSD');
            expect(result).toBeNull();
        });

        it('should throw error on other DB failure', async () => {
            mockSupabaseClient.from().single.mockResolvedValue({ data: null, error: { message: 'DB Failed' } });

            await expect(repository.getLatestFxDate('EURUSD')).rejects.toThrow(/DB Failed/);
        });
    });

    describe('upsertFxRate', () => {
        it('should upsert correctly', async () => {
            mockSupabaseClient.from().upsert.mockResolvedValue({ error: null });

            await repository.upsertFxRate('2026-06-08', 'EURUSD', 1.05);

            expect(mockSupabaseClient.from).toHaveBeenCalledWith('macro_fx_rates_daily');
            expect(mockSupabaseClient.from().upsert).toHaveBeenCalledWith(
                { observation_date: '2026-06-08', currency_pair: 'EURUSD', rate: 1.05 },
                { onConflict: 'observation_date, currency_pair' }
            );
        });

        it('should throw error on failure', async () => {
            mockSupabaseClient.from().upsert.mockResolvedValue({ error: { message: 'DB Error' } });

            await expect(repository.upsertFxRate('2026-06-08', 'EURUSD', 1.05)).rejects.toThrow(/DB Error/);
        });
    });
});
