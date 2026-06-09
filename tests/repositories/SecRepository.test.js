import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSecRepository } from '../../src/repositories/SecRepository.js';

describe('SecRepository', () => {
    let mockSupabaseClient;
    let repository;

    beforeEach(() => {
        const queryBuilder = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            not: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            update: vi.fn().mockReturnThis(),
            insert: vi.fn().mockReturnThis(),
            single: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockReturnThis()
        };

        mockSupabaseClient = {
            from: vi.fn().mockReturnValue(queryBuilder)
        };

        repository = createSecRepository(mockSupabaseClient);
    });

    describe('getCompaniesWithoutCik', () => {
        it('should return companies', async () => {
            mockSupabaseClient.from().is.mockReturnThis();
            mockSupabaseClient.from().eq.mockResolvedValue({ data: [{ ticker: 'AAPL' }], error: null });

            const result = await repository.getCompaniesWithoutCik();
            expect(result).toEqual([{ ticker: 'AAPL' }]);
        });

        it('should throw error on DB failure', async () => {
            mockSupabaseClient.from().is.mockReturnThis();
            mockSupabaseClient.from().eq.mockResolvedValue({ data: null, error: { message: 'DB Failed' } });

            await expect(repository.getCompaniesWithoutCik()).rejects.toThrow(/DB Failed/);
        });
    });

    describe('updateCompanyCik', () => {
        it('should update correctly', async () => {
            mockSupabaseClient.from().eq.mockResolvedValue({ error: null });

            await repository.updateCompanyCik('AAPL', '123');

            expect(mockSupabaseClient.from().update).toHaveBeenCalledWith(expect.objectContaining({ cik: '123' }));
        });

        it('should throw error on failure', async () => {
            mockSupabaseClient.from().eq.mockResolvedValue({ error: { message: 'DB Error' } });

            await expect(repository.updateCompanyCik('AAPL', '123')).rejects.toThrow(/DB Error/);
        });
    });

    describe('getTrackedCompanies', () => {
        it('should return companies', async () => {
            mockSupabaseClient.from().not.mockReturnThis();
            mockSupabaseClient.from().eq.mockResolvedValue({ data: [{ ticker: 'AAPL' }], error: null });

            const result = await repository.getTrackedCompanies();
            expect(result).toEqual([{ ticker: 'AAPL' }]);
        });

        it('should throw error on failure', async () => {
            mockSupabaseClient.from().not.mockReturnThis();
            mockSupabaseClient.from().eq.mockResolvedValue({ data: null, error: { message: 'DB Error' } });

            await expect(repository.getTrackedCompanies()).rejects.toThrow(/DB Error/);
        });
    });

    describe('getCompanyKeywords', () => {
        it('should group keywords correctly', async () => {
            mockSupabaseClient.from().eq.mockReturnValue({
                eq: vi.fn().mockResolvedValue({ 
                    data: [
                        { metric_name: 'REVENUE', keyword: 'sales' },
                        { metric_name: 'REVENUE', keyword: 'revenue' },
                        { metric_name: 'COSTS', keyword: 'expense' }
                    ], 
                    error: null 
                })
            });

            const result = await repository.getCompanyKeywords('AAPL');
            expect(result).toEqual({
                REVENUE: ['sales', 'revenue'],
                COSTS: ['expense']
            });
        });

        it('should throw error on failure', async () => {
            mockSupabaseClient.from().eq.mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB Error' } })
            });

            await expect(repository.getCompanyKeywords('AAPL')).rejects.toThrow(/DB Error/);
        });
    });

    describe('filingExists', () => {
        it('should return true if filing exists', async () => {
            mockSupabaseClient.from().maybeSingle.mockResolvedValue({ data: { id: 1 }, error: null });

            const result = await repository.filingExists('123');
            expect(result).toBe(true);
        });

        it('should return false if filing does not exist', async () => {
            mockSupabaseClient.from().maybeSingle.mockResolvedValue({ data: null, error: null });

            const result = await repository.filingExists('123');
            expect(result).toBe(false);
        });

        it('should throw error on DB failure', async () => {
            mockSupabaseClient.from().maybeSingle.mockResolvedValue({ data: null, error: { message: 'DB Failed' } });

            await expect(repository.filingExists('123')).rejects.toThrow(/DB Failed/);
        });
    });

    describe('saveRawFiling', () => {
        it('should insert correctly', async () => {
            mockSupabaseClient.from().single.mockResolvedValue({ data: { id: 1 }, error: null });

            const result = await repository.saveRawFiling('AAPL', '10-K', '2026-06-08', '123', 'content');
            expect(result).toBe(1);
        });

        it('should throw error on DB failure', async () => {
            mockSupabaseClient.from().single.mockResolvedValue({ data: null, error: { message: 'DB Failed' } });

            await expect(repository.saveRawFiling('AAPL', '10-K', '2026-06-08', '123', 'content')).rejects.toThrow(/DB Failed/);
        });
    });

    describe('fmpFundamentalExists', () => {
        it('should return true if exists', async () => {
            mockSupabaseClient.from().maybeSingle.mockResolvedValue({ data: { id: 1 }, error: null });

            const result = await repository.fmpFundamentalExists('AAPL', 2026, 'Q1');
            expect(result).toBe(true);
        });

        it('should return false if does not exist', async () => {
            mockSupabaseClient.from().maybeSingle.mockResolvedValue({ data: null, error: null });

            const result = await repository.fmpFundamentalExists('AAPL', 2026, 'Q1');
            expect(result).toBe(false);
        });

        it('should return false on DB error', async () => {
            mockSupabaseClient.from().maybeSingle.mockResolvedValue({ data: null, error: { message: 'DB Error' } });

            const result = await repository.fmpFundamentalExists('AAPL', 2026, 'Q1');
            expect(result).toBe(false);
        });
    });

    describe('saveFmpFundamentals', () => {
        it('should insert correctly', async () => {
            mockSupabaseClient.from().insert.mockResolvedValue({ error: null });

            await repository.saveFmpFundamentals({ ticker: 'AAPL' });
            expect(mockSupabaseClient.from().insert).toHaveBeenCalledWith([{ ticker: 'AAPL' }]);
        });

        it('should throw error on DB failure', async () => {
            mockSupabaseClient.from().insert.mockResolvedValue({ error: { message: 'DB Failed' } });

            await expect(repository.saveFmpFundamentals({ ticker: 'AAPL' })).rejects.toThrow(/DB Failed/);
        });
    });

    describe('saveAiSignals', () => {
        it('should do nothing if empty', async () => {
            await repository.saveAiSignals([]);
            expect(mockSupabaseClient.from().insert).not.toHaveBeenCalled();
        });

        it('should insert correctly', async () => {
            mockSupabaseClient.from().insert.mockResolvedValue({ error: null });

            await repository.saveAiSignals([{ ticker: 'AAPL' }]);
            expect(mockSupabaseClient.from().insert).toHaveBeenCalledWith([{ ticker: 'AAPL' }]);
        });

        it('should throw error on DB failure', async () => {
            mockSupabaseClient.from().insert.mockResolvedValue({ error: { message: 'DB Failed' } });

            await expect(repository.saveAiSignals([{ ticker: 'AAPL' }])).rejects.toThrow(/DB Failed/);
        });
    });
});
