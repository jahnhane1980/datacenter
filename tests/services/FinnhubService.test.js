import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FinnhubService } from '../../src/services/FinnhubService.js';
import ky from 'ky';

vi.mock('ky', () => {
    return {
        default: {
            create: vi.fn().mockReturnThis(),
            get: vi.fn()
        }
    };
});

describe('FinnhubService', () => {
    let service;

    beforeEach(() => {
        process.env.FINNHUB_API_KEY = 'TEST_KEY';
        service = new FinnhubService();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('getEarningsCalendar', () => {
        it('should fetch calendar correctly', async () => {
            const expectedData = { earningsCalendar: [] };
            ky.get.mockReturnValue({
                json: vi.fn().mockResolvedValue(expectedData)
            });

            const result = await service.getEarningsCalendar('2026-06-01', '2026-06-08');
            expect(result).toEqual(expectedData);
            expect(ky.get).toHaveBeenCalledWith('calendar/earnings', { searchParams: { token: 'TEST_KEY', from: '2026-06-01', to: '2026-06-08' } });
        });

        it('should throw error on failure', async () => {
            ky.get.mockReturnValue({
                json: vi.fn().mockRejectedValue(new Error('Network error'))
            });

            await expect(service.getEarningsCalendar('2026-06-01', '2026-06-08')).rejects.toThrow(/Network error/);
        });
    });

    describe('getFdaCalendar', () => {
        it('should fetch calendar correctly', async () => {
            const expectedData = [{ id: 1 }];
            ky.get.mockReturnValue({
                json: vi.fn().mockResolvedValue(expectedData)
            });

            const result = await service.getFdaCalendar();
            expect(result).toEqual(expectedData);
            expect(ky.get).toHaveBeenCalledWith('fda-advisory-committee-calendar', { searchParams: { token: 'TEST_KEY' } });
        });
    });
});
