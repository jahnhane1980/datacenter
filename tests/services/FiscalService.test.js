import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFiscalService, TREASURY_TYPES } from '../../src/services/FiscalService.js';
import ky from 'ky';

vi.mock('ky');

describe('FiscalService', () => {
    let service;

    beforeEach(() => {
        service = createFiscalService();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('fetchAuctions', () => {
        it('should fetch and return data array', async () => {
            const expectedData = [{ cusip: '123' }];
            ky.get.mockReturnValue({
                json: vi.fn().mockResolvedValue({ data: expectedData })
            });

            const result = await service.fetchAuctions(TREASURY_TYPES.BILL, '2026-06-01');
            expect(result).toEqual(expectedData);
            expect(ky.get).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
                searchParams: expect.objectContaining({
                    filter: `security_type:eq:Bill,auction_date:gte:2026-06-01`
                })
            }));
        });

        it('should throw error on fetch failure', async () => {
            ky.get.mockReturnValue({
                json: vi.fn().mockRejectedValue(new Error('Network error'))
            });

            await expect(service.fetchAuctions(TREASURY_TYPES.BILL, '2026-06-01')).rejects.toThrow(/Network error/);
        });
    });

    describe('getRecentAuctions', () => {
        it('should fetch data for recent days', async () => {
            const expectedData = [{ cusip: '123' }];
            ky.get.mockReturnValue({
                json: vi.fn().mockResolvedValue({ data: expectedData })
            });

            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));

            const result = await service.getRecentAuctions(TREASURY_TYPES.BILL, 14);
            expect(result).toEqual(expectedData);
            expect(ky.get).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
                searchParams: expect.objectContaining({
                    filter: expect.stringContaining('2026-06-01')
                })
            }));

            vi.useRealTimers();
        });
    });
});
