import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createGlobalMacroService } from '../../src/services/GlobalMacroService.js';
import ky from 'ky';

vi.mock('ky');

describe('GlobalMacroService', () => {
    let service;

    beforeEach(() => {
        process.env.FRED_API_KEY = 'TEST_KEY';
        service = createGlobalMacroService();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('fetchSeriesData', () => {
        it('should throw if no apiKey provided', async () => {
            delete process.env.FRED_API_KEY;
            const failingService = createGlobalMacroService();
            await expect(failingService.fetchSeriesData('SERIES1', '2026-06-01')).rejects.toThrow(/FRED_API_KEY fehlt/);
            process.env.FRED_API_KEY = 'TEST_KEY';
        });

        it('should fetch and return observations array', async () => {
            const expectedData = [{ value: '100' }];
            ky.get.mockReturnValue({
                json: vi.fn().mockResolvedValue({ observations: expectedData })
            });

            const result = await service.fetchSeriesData('SERIES1', '2026-06-01');
            expect(result).toEqual(expectedData);
            expect(ky.get).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
                searchParams: expect.objectContaining({
                    series_id: 'SERIES1',
                    observation_start: '2026-06-01'
                })
            }));
        });

        it('should throw error on fetch failure', async () => {
            ky.get.mockReturnValue({
                json: vi.fn().mockRejectedValue(new Error('Network error'))
            });

            await expect(service.fetchSeriesData('SERIES1', '2026-06-01')).rejects.toThrow(/Network error/);
        });
    });
});
