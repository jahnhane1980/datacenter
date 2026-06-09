import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createQRAService } from '../../src/services/QRAService.js';
import ky from 'ky';

vi.mock('ky');

describe('QRAService', () => {
    let service;

    beforeEach(() => {
        service = createQRAService();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-06-08T12:00:00Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    describe('fetchLatestFinancingEstimates', () => {
        it('should parse values correctly', async () => {
            ky.get.mockReturnValueOnce({
                text: vi.fn().mockResolvedValue(`<html><body><a href="/article1">Marketable Borrowing Estimates</a></body></html>`)
            }).mockReturnValueOnce({
                text: vi.fn().mockResolvedValue(`<html><body><div class="field--type-text-with-summary">During the quarter, Treasury expects to borrow $243 billion in privately-held net marketable debt, assuming an end-of-June cash balance of $750 billion.</div></body></html>`)
            });

            const result = await service.fetchLatestFinancingEstimates();
            expect(result).toEqual({
                targetQuarter: '2026-Q2',
                releaseDate: '2026-06-08',
                estimatedNetBorrowing: 243000000000,
                estimatedTgaBalance: 750000000000
            });
        });

        it('should return null if no link found', async () => {
            ky.get.mockReturnValueOnce({
                text: vi.fn().mockResolvedValue(`<html><body><a>Random Link</a></body></html>`)
            });

            const result = await service.fetchLatestFinancingEstimates();
            expect(result).toBeNull();
        });

        it('should return null if values cannot be parsed', async () => {
            ky.get.mockReturnValueOnce({
                text: vi.fn().mockResolvedValue(`<html><body><a href="/article1">Marketable Borrowing Estimates</a></body></html>`)
            }).mockReturnValueOnce({
                text: vi.fn().mockResolvedValue(`<html><body><div class="field--type-text-with-summary">Nothing to see here.</div></body></html>`)
            });

            const result = await service.fetchLatestFinancingEstimates();
            expect(result).toBeNull();
        });

        it('should throw error on fetch failure', async () => {
            ky.get.mockReturnValue({
                text: vi.fn().mockRejectedValue(new Error('Network error'))
            });

            await expect(service.fetchLatestFinancingEstimates()).rejects.toThrow(/Network error/);
        });
    });
});
