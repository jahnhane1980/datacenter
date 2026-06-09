import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CboeRepository } from '../../src/repositories/CboeRepository.js';

describe('CboeRepository', () => {
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

        repository = new CboeRepository(mockSupabaseClient);
    });

    describe('upsertVolumeData', () => {
        it('should upsert volume data correctly', async () => {
            mockSupabaseClient.from().upsert.mockResolvedValue({ error: null });

            await repository.upsertVolumeData(1, 1600000000, 5000);

            expect(mockSupabaseClient.from).toHaveBeenCalledWith('option_cboe_volume');
            expect(mockSupabaseClient.from().upsert).toHaveBeenCalledWith(
                { ticker: 1, timestamp: 1600000000, volume: 5000 },
                { onConflict: 'ticker,timestamp' }
            );
        });

        it('should throw an error if upsert fails', async () => {
            mockSupabaseClient.from().upsert.mockResolvedValue({ error: { message: 'DB Error' } });

            await expect(repository.upsertVolumeData(1, 1600000000, 5000)).rejects.toThrow(/DB Error/);
        });
    });

    describe('getLatestTimestamp', () => {
        it('should return timestamp if data is found', async () => {
            mockSupabaseClient.from().limit.mockResolvedValue({ data: [{ timestamp: 1600000000 }], error: null });

            const result = await repository.getLatestTimestamp(1);

            expect(mockSupabaseClient.from().select).toHaveBeenCalledWith('timestamp');
            expect(result).toBe(1600000000);
        });

        it('should return null if no data is found', async () => {
            mockSupabaseClient.from().limit.mockResolvedValue({ data: [], error: null });

            const result = await repository.getLatestTimestamp(1);

            expect(result).toBeNull();
        });

        it('should return null if data is null', async () => {
            mockSupabaseClient.from().limit.mockResolvedValue({ data: null, error: null });

            const result = await repository.getLatestTimestamp(1);

            expect(result).toBeNull();
        });

        it('should throw error if db fails', async () => {
            mockSupabaseClient.from().limit.mockResolvedValue({ data: null, error: { message: 'DB Failed' } });

            await expect(repository.getLatestTimestamp(1)).rejects.toThrow(/DB Failed/);
        });
    });
});
