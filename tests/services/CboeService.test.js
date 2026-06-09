import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CboeService } from '../../src/services/CboeService.js';
import ky from 'ky';

vi.mock('ky', () => {
    return {
        default: {
            create: vi.fn().mockReturnThis(),
            get: vi.fn()
        }
    };
});

describe('CboeService', () => {
    let service;

    beforeEach(() => {
        service = new CboeService();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('fetchOptionsVolume', () => {
        it('should handle empty or No data found response', async () => {
            ky.get.mockReturnValue({
                text: vi.fn().mockResolvedValue('No data found for this symbol.')
            });

            const result = await service.fetchOptionsVolume('AAPL', '2026-06-01', '2026-06-08');
            expect(result).toEqual([]);
        });

        it('should parse valid CSV data', async () => {
            const csvData = `date,volume\n2026-06-01,100\n2026-06-02,200`;
            ky.get.mockReturnValue({
                text: vi.fn().mockResolvedValue(csvData)
            });

            const result = await service.fetchOptionsVolume('AAPL', '2026-06-01', '2026-06-08');
            expect(result).toHaveLength(2);
            expect(result[0].date).toBe('2026-06-01');
            expect(result[0].volume).toBe('100');
        });

        it('should throw error on fetch failure', async () => {
            ky.get.mockReturnValue({
                text: vi.fn().mockRejectedValue(new Error('Network error'))
            });

            await expect(service.fetchOptionsVolume('AAPL', '2026-06-01', '2026-06-08')).rejects.toThrow(/CBOE-GET fehlgeschlagen/);
        });
    });
});
