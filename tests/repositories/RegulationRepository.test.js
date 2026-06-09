import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRegulationRepository } from '../../src/repositories/RegulationRepository.js';

describe('RegulationRepository', () => {
    let mockSupabaseClient;
    let repository;

    beforeEach(() => {
        const queryBuilder = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            insert: vi.fn().mockReturnThis()
        };

        mockSupabaseClient = {
            from: vi.fn().mockReturnValue(queryBuilder)
        };

        repository = createRegulationRepository(mockSupabaseClient);
    });

    describe('documentExists', () => {
        it('should return true if document exists', async () => {
            mockSupabaseClient.from().single.mockResolvedValue({ data: { document_number: '123' }, error: null });

            const result = await repository.documentExists('123');
            expect(mockSupabaseClient.from).toHaveBeenCalledWith('macro_reg_alerts');
            expect(result).toBe(true);
        });

        it('should return false if PGRST116 (not found)', async () => {
            mockSupabaseClient.from().single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });

            const result = await repository.documentExists('123');
            expect(result).toBe(false);
        });

        it('should throw error on other DB failure', async () => {
            mockSupabaseClient.from().single.mockResolvedValue({ data: null, error: { message: 'DB Failed' } });

            await expect(repository.documentExists('123')).rejects.toThrow(/DB Failed/);
        });
    });

    describe('insertDocument', () => {
        it('should insert correctly', async () => {
            mockSupabaseClient.from().insert.mockResolvedValue({ error: null });

            await repository.insertDocument('123', '2026-06-08', 'Title', 'URL', 'Abstract');

            expect(mockSupabaseClient.from).toHaveBeenCalledWith('macro_reg_alerts');
            expect(mockSupabaseClient.from().insert).toHaveBeenCalledWith([{
                document_number: '123',
                publication_date: '2026-06-08',
                title: 'Title',
                pdf_url: 'URL',
                abstract: 'Abstract'
            }]);
        });

        it('should throw error on failure', async () => {
            mockSupabaseClient.from().insert.mockResolvedValue({ error: { message: 'DB Error' } });

            await expect(repository.insertDocument('123', '2026-06-08', 'Title', 'URL', 'Abstract')).rejects.toThrow(/DB Error/);
        });
    });

    describe('getCurrentRatio', () => {
        it('should return ratio', async () => {
            mockSupabaseClient.from().single.mockResolvedValue({ data: { ratio_percent: 10 }, error: null });

            const result = await repository.getCurrentRatio();
            expect(mockSupabaseClient.from).toHaveBeenCalledWith('macro_reserve_requirements');
            expect(result).toBe(10);
        });

        it('should throw error on DB failure', async () => {
            mockSupabaseClient.from().single.mockResolvedValue({ data: null, error: { message: 'DB Failed' } });

            await expect(repository.getCurrentRatio()).rejects.toThrow(/DB Failed/);
        });
    });

    describe('insertNewRatio', () => {
        it('should insert correctly', async () => {
            mockSupabaseClient.from().insert.mockResolvedValue({ error: null });

            await repository.insertNewRatio('2026-06-08', 12.5, '123');

            expect(mockSupabaseClient.from).toHaveBeenCalledWith('macro_reserve_requirements');
            expect(mockSupabaseClient.from().insert).toHaveBeenCalledWith([{
                effective_date: '2026-06-08',
                ratio_percent: 12.5,
                document_number: '123'
            }]);
        });

        it('should throw error on failure', async () => {
            mockSupabaseClient.from().insert.mockResolvedValue({ error: { message: 'DB Error' } });

            await expect(repository.insertNewRatio('2026-06-08', 12.5, '123')).rejects.toThrow(/DB Error/);
        });
    });
});
