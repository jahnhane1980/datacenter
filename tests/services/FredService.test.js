import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFredService } from '../../src/services/FredService.js';
import ky from 'ky';

vi.mock('ky');

describe('FredService', () => {
    let service;

    beforeEach(() => {
        process.env.FRED_API_KEY = 'TEST_KEY';
        service = createFredService('TEST_KEY');
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should throw if no apiKey provided', () => {
        delete process.env.FRED_API_KEY;
        expect(() => createFredService(null)).toThrow(/FRED_API_KEY ist nicht definiert/);
        process.env.FRED_API_KEY = 'TEST_KEY';
    });

    describe('fetchObservations', () => {
        it('should fetch and return observations array', async () => {
            const expectedData = [{ value: '100' }];
            ky.get.mockReturnValue({
                json: vi.fn().mockResolvedValue({ observations: expectedData })
            });

            const result = await service.fetchObservations('SERIES1', '2026-06-01');
            expect(result).toEqual(expectedData);
            expect(ky.get).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
                searchParams: expect.objectContaining({
                    series_id: 'SERIES1',
                    observation_start: '2026-06-01'
                })
            }));
        });

        it('should include end date if provided', async () => {
            ky.get.mockReturnValue({
                json: vi.fn().mockResolvedValue({ observations: [] })
            });

            await service.fetchObservations('SERIES1', '2026-06-01', '2026-06-08');
            expect(ky.get).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
                searchParams: expect.objectContaining({
                    observation_end: '2026-06-08'
                })
            }));
        });

        it('should throw error on fetch failure', async () => {
            ky.get.mockReturnValue({
                json: vi.fn().mockRejectedValue(new Error('Network error'))
            });

            await expect(service.fetchObservations('SERIES1', '2026-06-01')).rejects.toThrow(/Network error/);
        });
    });

    describe('getBackfillData', () => {
        it('should fetch data from 2021-01-01', async () => {
            ky.get.mockReturnValue({
                json: vi.fn().mockResolvedValue({ observations: [] })
            });

            await service.getBackfillData('SERIES1');
            expect(ky.get).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
                searchParams: expect.objectContaining({
                    observation_start: '2021-01-01'
                })
            }));
        });
    });

    describe('getRecentData', () => {
        it('should fetch data for recent days', async () => {
            ky.get.mockReturnValue({
                json: vi.fn().mockResolvedValue({ observations: [] })
            });

            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-06-08T12:00:00Z'));

            await service.getRecentData('SERIES1', 7);
            expect(ky.get).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
                searchParams: expect.objectContaining({
                    observation_start: '2026-06-01'
                })
            }));

            vi.useRealTimers();
        });
    });
});
