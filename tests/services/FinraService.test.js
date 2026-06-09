import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FinraService } from '../../src/services/FinraService.js';
import ky from 'ky';

vi.mock('ky', () => {
    return {
        default: {
            create: vi.fn().mockReturnThis(),
            get: vi.fn()
        }
    };
});

describe('FinraService', () => {
    let service;

    beforeEach(() => {
        service = new FinraService();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('getDownloadLinksForPeriod', () => {
        it('should return matched links from API', async () => {
            ky.get.mockReturnValue({
                json: vi.fn().mockResolvedValue({
                    data: [
                        { url: 'https://cdn.finra.org/shvol20260608.txt' },
                        { href: 'https://cdn.finra.org/shvol20260609.txt' },
                        { url: 'https://other.com/shvol20260609.txt' } // Should filter out
                    ]
                })
            });

            const result = await service.getDownloadLinksForPeriod(2026, '06');
            expect(result).toEqual([
                'https://cdn.finra.org/shvol20260608.txt',
                'https://cdn.finra.org/shvol20260609.txt'
            ]);
        });

        it('should guess links on API failure', async () => {
            ky.get.mockReturnValue({
                json: vi.fn().mockRejectedValue(new Error('Network Down'))
            });

            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-06-05T12:00:00Z'));

            const result = await service.getDownloadLinksForPeriod(2026, '06');
            
            // Should guess up to current day (5)
            expect(result.length).toBe(5);
            expect(result[0]).toContain('shvol20260601.txt');
            expect(result[4]).toContain('shvol20260605.txt');

            vi.useRealTimers();
        });
    });

    describe('downloadFileContent', () => {
        it('should download content correctly', async () => {
            ky.get.mockReturnValue({
                text: vi.fn().mockResolvedValue('FILE_CONTENT')
            });

            const result = await service.downloadFileContent('https://url');
            expect(result).toBe('FILE_CONTENT');
        });

        it('should return null on 403 or 404', async () => {
            ky.get.mockReturnValue({
                text: vi.fn().mockRejectedValue(new Error('HTTPError: 404 Not Found'))
            });

            const result = await service.downloadFileContent('https://url');
            expect(result).toBeNull();
        });

        it('should throw on other errors', async () => {
            ky.get.mockReturnValue({
                text: vi.fn().mockRejectedValue(new Error('Network error'))
            });

            await expect(service.downloadFileContent('https://url')).rejects.toThrow(/Network error/);
        });
    });
});
