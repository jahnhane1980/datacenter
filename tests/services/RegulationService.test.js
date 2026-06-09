import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRegulationService } from '../../src/services/RegulationService.js';
import ky from 'ky';

vi.mock('ky');

describe('RegulationService', () => {
    let service;

    beforeEach(() => {
        service = createRegulationService();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('fetchRecentRegulationD', () => {
        it('should fetch and return array', async () => {
            const expectedData = [{ document_number: '123' }];
            ky.get.mockReturnValue({
                json: vi.fn().mockResolvedValue({ results: expectedData })
            });

            const result = await service.fetchRecentRegulationD();
            expect(result).toEqual(expectedData);
            expect(ky.get).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
                searchParams: expect.objectContaining({
                    'conditions[term]': 'Regulation D'
                })
            }));
        });

        it('should return empty array if no results', async () => {
            ky.get.mockReturnValue({
                json: vi.fn().mockResolvedValue({})
            });

            const result = await service.fetchRecentRegulationD();
            expect(result).toEqual([]);
        });

        it('should throw error on fetch failure', async () => {
            ky.get.mockReturnValue({
                json: vi.fn().mockRejectedValue(new Error('Network error'))
            });

            await expect(service.fetchRecentRegulationD()).rejects.toThrow(/Network error/);
        });
    });
});
