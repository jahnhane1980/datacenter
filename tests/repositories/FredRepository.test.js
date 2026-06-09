import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFredRepository } from '../../src/repositories/FredRepository.js';

describe('FredRepository', () => {
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

        repository = createFredRepository(mockSupabaseClient);
    });

    describe('upsertMacroData', () => {
        it('should upsert correctly', async () => {
            mockSupabaseClient.from().upsert.mockResolvedValue({ error: null });

            await repository.upsertMacroData('2026-06-08', 100, 200, 300, 400, 500, 5.2);

            expect(mockSupabaseClient.from).toHaveBeenCalledWith('macro_us_liquidity');
            expect(mockSupabaseClient.from().upsert).toHaveBeenCalledWith(
                { 
                    observation_date: '2026-06-08',
                    tga_balance: 100,
                    rrp_balance: 200,
                    fed_balance: 300,
                    btfp_balance: 400,
                    bank_reserves_fed: 500,
                    sofr_rate: 5.2
                }, 
                { onConflict: 'observation_date' }
            );
        });

        it('should throw error on failure', async () => {
            mockSupabaseClient.from().upsert.mockResolvedValue({ error: { message: 'DB Error' } });

            await expect(repository.upsertMacroData('2026-06-08', 100, 200, 300, 400, 500, 5.2)).rejects.toThrow(/DB Error/);
        });
    });

    describe('upsertMacroIndicatorValues', () => {
        it('should do nothing if array is empty', async () => {
            await repository.upsertMacroIndicatorValues([]);
            expect(mockSupabaseClient.from).not.toHaveBeenCalled();
        });

        it('should upsert correctly', async () => {
            mockSupabaseClient.from().upsert.mockResolvedValue({ error: null });

            const values = [{ indicator_id: 1, observation_date: '2026-06-08', value: 10 }];
            await repository.upsertMacroIndicatorValues(values);

            expect(mockSupabaseClient.from).toHaveBeenCalledWith('macro_us_indicator_values');
            expect(mockSupabaseClient.from().upsert).toHaveBeenCalledWith(values, { onConflict: 'indicator_id, observation_date' });
        });

        it('should throw error on failure', async () => {
            mockSupabaseClient.from().upsert.mockResolvedValue({ error: { message: 'DB Error' } });

            await expect(repository.upsertMacroIndicatorValues([{ indicator_id: 1 }])).rejects.toThrow(/DB Error/);
        });
    });

    describe('getMacroIndicatorDefinitions', () => {
        it('should return definitions', async () => {
            mockSupabaseClient.from().select.mockResolvedValue({ data: [{ id: 1, series_id: 'TEST' }], error: null });

            const result = await repository.getMacroIndicatorDefinitions();

            expect(mockSupabaseClient.from).toHaveBeenCalledWith('macro_us_indicator_definition');
            expect(result).toEqual([{ id: 1, series_id: 'TEST' }]);
        });

        it('should throw error on failure', async () => {
            mockSupabaseClient.from().select.mockResolvedValue({ data: null, error: { message: 'DB Error' } });

            await expect(repository.getMacroIndicatorDefinitions()).rejects.toThrow(/DB Error/);
        });
    });

    describe('getLatestObservationDate', () => {
        it('should return date if data is found', async () => {
            mockSupabaseClient.from().limit.mockResolvedValue({ data: [{ observation_date: '2026-06-08' }], error: null });

            const result = await repository.getLatestObservationDate();

            expect(mockSupabaseClient.from().select).toHaveBeenCalledWith('observation_date');
            expect(result).toBe('2026-06-08');
        });

        it('should return null if no data is found', async () => {
            mockSupabaseClient.from().limit.mockResolvedValue({ data: [], error: null });

            const result = await repository.getLatestObservationDate();
            expect(result).toBeNull();
        });

        it('should throw error if db fails', async () => {
            mockSupabaseClient.from().limit.mockResolvedValue({ data: null, error: { message: 'DB Failed' } });

            await expect(repository.getLatestObservationDate()).rejects.toThrow(/DB Failed/);
        });
    });
});
