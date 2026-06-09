import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SectorRotationRepository } from '../../src/repositories/SectorRotationRepository.js';

describe('SectorRotationRepository', () => {
    let mockSupabaseClient;
    let repository;

    beforeEach(() => {
        const queryBuilder = {
            select: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            single: vi.fn().mockReturnThis(),
            upsert: vi.fn().mockReturnThis()
        };

        mockSupabaseClient = {
            from: vi.fn().mockReturnValue(queryBuilder)
        };

        repository = new SectorRotationRepository(mockSupabaseClient);
    });

    it('should throw on missing supabaseClient', () => {
        expect(() => new SectorRotationRepository()).toThrow(/supabaseClient fehlt/);
    });

    describe('getLatestLogDate', () => {
        it('should return date if data is found', async () => {
            mockSupabaseClient.from().single.mockResolvedValue({ data: { datum: '2026-06-08' }, error: null });

            const result = await repository.getLatestLogDate();
            expect(mockSupabaseClient.from).toHaveBeenCalledWith('sector_rotation_log');
            expect(result).toBe('2026-06-08');
        });

        it('should return null if PGRST116 (not found)', async () => {
            mockSupabaseClient.from().single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });

            const result = await repository.getLatestLogDate();
            expect(result).toBeNull();
        });

        it('should throw error on other DB failure', async () => {
            mockSupabaseClient.from().single.mockResolvedValue({ data: null, error: { message: 'DB Failed' } });

            await expect(repository.getLatestLogDate()).rejects.toThrow(/DB Failed/);
        });
    });

    describe('upsertLogs', () => {
        it('should do nothing if logs array is empty', async () => {
            await repository.upsertLogs([]);
            expect(mockSupabaseClient.from).not.toHaveBeenCalled();
        });

        it('should upsert correctly', async () => {
            mockSupabaseClient.from().upsert.mockResolvedValue({ error: null });

            const logs = [{ datum: '2026-06-08', ticker_id: 1 }];
            await repository.upsertLogs(logs);

            expect(mockSupabaseClient.from).toHaveBeenCalledWith('sector_rotation_log');
            expect(mockSupabaseClient.from().upsert).toHaveBeenCalledWith(logs, { onConflict: 'datum, ticker_id' });
        });

        it('should throw error on failure', async () => {
            mockSupabaseClient.from().upsert.mockResolvedValue({ error: { message: 'DB Error' } });

            await expect(repository.upsertLogs([{ datum: '2026-06-08', ticker_id: 1 }])).rejects.toThrow(/DB Error/);
        });
    });
});
