import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createQRARepository } from '../../src/repositories/QRARepository.js';

describe('QRARepository', () => {
    let mockSupabaseClient;
    let repository;

    beforeEach(() => {
        const queryBuilder = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            lt: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            upsert: vi.fn().mockReturnThis(),
            update: vi.fn().mockReturnThis(),
            insert: vi.fn().mockReturnThis()
        };

        mockSupabaseClient = {
            from: vi.fn().mockReturnValue(queryBuilder)
        };

        repository = createQRARepository(mockSupabaseClient);
    });

    describe('upsertQraEstimate', () => {
        it('should upsert correctly', async () => {
            mockSupabaseClient.from().upsert.mockResolvedValue({ error: null });

            await repository.upsertQraEstimate('2026-Q3', '2026-06-08', 500000, 100000);

            expect(mockSupabaseClient.from).toHaveBeenCalledWith('treasury_qra_estimates');
            expect(mockSupabaseClient.from().upsert).toHaveBeenCalledWith(
                { 
                    target_quarter: '2026-Q3',
                    release_date: '2026-06-08',
                    estimated_net_borrowing: 500000,
                    estimated_tga_balance: 100000
                }, 
                { onConflict: 'target_quarter, release_date' }
            );
        });

        it('should throw error on failure', async () => {
            mockSupabaseClient.from().upsert.mockResolvedValue({ error: { message: 'DB Error' } });

            await expect(repository.upsertQraEstimate('2026-Q3', '2026-06-08', 500000, 100000)).rejects.toThrow(/DB Error/);
        });
    });

    describe('getLatestEstimateForQuarter', () => {
        it('should return object if data is found', async () => {
            mockSupabaseClient.from().limit.mockResolvedValue({ data: [{ estimated_net_borrowing: 500000 }], error: null });

            const result = await repository.getLatestEstimateForQuarter('2026-Q3');
            expect(mockSupabaseClient.from().eq).toHaveBeenCalledWith('target_quarter', '2026-Q3');
            expect(result).toEqual({ estimated_net_borrowing: 500000 });
        });

        it('should return null if no data is found', async () => {
            mockSupabaseClient.from().limit.mockResolvedValue({ data: [], error: null });

            const result = await repository.getLatestEstimateForQuarter('2026-Q3');
            expect(result).toBeNull();
        });

        it('should throw error if db fails', async () => {
            mockSupabaseClient.from().limit.mockResolvedValue({ data: null, error: { message: 'DB Failed' } });

            await expect(repository.getLatestEstimateForQuarter('2026-Q3')).rejects.toThrow(/DB Failed/);
        });
    });

    describe('getEstimateForPreviousQuarter', () => {
        it('should return object if data is found', async () => {
            mockSupabaseClient.from().limit.mockResolvedValue({ data: [{ estimated_net_borrowing: 400000 }], error: null });

            const result = await repository.getEstimateForPreviousQuarter('2026-Q3');
            expect(mockSupabaseClient.from().lt).toHaveBeenCalledWith('target_quarter', '2026-Q3');
            expect(result).toEqual({ estimated_net_borrowing: 400000 });
        });

        it('should return null if no data is found', async () => {
            mockSupabaseClient.from().limit.mockResolvedValue({ data: [], error: null });

            const result = await repository.getEstimateForPreviousQuarter('2026-Q3');
            expect(result).toBeNull();
        });

        it('should throw error if db fails', async () => {
            mockSupabaseClient.from().limit.mockResolvedValue({ data: null, error: { message: 'DB Failed' } });

            await expect(repository.getEstimateForPreviousQuarter('2026-Q3')).rejects.toThrow(/DB Failed/);
        });
    });

    describe('saveQraConsensus', () => {
        it('should update if estimate already exists', async () => {
            mockSupabaseClient.from().eq.mockReturnValueOnce(mockSupabaseClient.from()); // eq in getLatestEstimate
            mockSupabaseClient.from().limit.mockResolvedValueOnce({ data: [{ target_quarter: '2026-Q3', release_date: '2026-06-08' }], error: null }); // limit in getLatestEstimate
            
            mockSupabaseClient.from().eq.mockReturnValueOnce(mockSupabaseClient.from()); // first eq in update
            mockSupabaseClient.from().eq.mockResolvedValueOnce({ error: null }); // second eq in update

            await repository.saveQraConsensus('2026-Q3', 400, 600, 500);

            expect(mockSupabaseClient.from().update).toHaveBeenCalledWith({
                consensus_borrowing_min: 400,
                consensus_borrowing_max: 600,
                consensus_borrowing_median: 500
            });
        });

        it('should throw error on update failure', async () => {
            mockSupabaseClient.from().eq.mockReturnValueOnce(mockSupabaseClient.from()); // eq in getLatestEstimate
            mockSupabaseClient.from().limit.mockResolvedValueOnce({ data: [{ target_quarter: '2026-Q3', release_date: '2026-06-08' }], error: null }); // limit in getLatestEstimate
            
            mockSupabaseClient.from().eq.mockReturnValueOnce(mockSupabaseClient.from()); // first eq in update
            mockSupabaseClient.from().eq.mockResolvedValueOnce({ error: { message: 'Update failed' } }); // second eq in update

            await expect(repository.saveQraConsensus('2026-Q3', 400, 600, 500)).rejects.toThrow(/Update failed/);
        });

        it('should insert if estimate does not exist', async () => {
            mockSupabaseClient.from().eq.mockReturnValueOnce(mockSupabaseClient.from()); // eq in getLatestEstimate
            mockSupabaseClient.from().limit.mockResolvedValueOnce({ data: [], error: null }); // limit in getLatestEstimate
            
            mockSupabaseClient.from().insert.mockResolvedValueOnce({ error: null });

            await repository.saveQraConsensus('2026-Q3', 400, 600, 500);

            expect(mockSupabaseClient.from().insert).toHaveBeenCalledWith(expect.objectContaining({
                target_quarter: '2026-Q3',
                consensus_borrowing_min: 400,
                consensus_borrowing_max: 600,
                consensus_borrowing_median: 500
            }));
        });

        it('should throw error on insert failure', async () => {
            mockSupabaseClient.from().eq.mockReturnValueOnce(mockSupabaseClient.from()); // eq in getLatestEstimate
            mockSupabaseClient.from().limit.mockResolvedValueOnce({ data: [], error: null }); // limit in getLatestEstimate
            
            mockSupabaseClient.from().insert.mockResolvedValueOnce({ error: { message: 'Insert failed' } });

            await expect(repository.saveQraConsensus('2026-Q3', 400, 600, 500)).rejects.toThrow(/Insert failed/);
        });
    });
});
