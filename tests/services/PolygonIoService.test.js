import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PolygonIoService } from '../../src/services/PolygonIoService.js';
import { HttpStatus } from '../../src/constants/HttpStatus.js';
import ky from 'ky';

vi.mock('ky', () => {
    return {
        default: {
            create: vi.fn().mockReturnThis(),
            get: vi.fn()
        }
    };
});

describe('PolygonIoService', () => {
    let service;
    let mockPacingManager;

    beforeEach(() => {
        process.env.POLYGONIO_API_KEY = 'TEST_API_KEY';
        mockPacingManager = {
            sleepMs: vi.fn().mockResolvedValue(),
            sleepSeconds: vi.fn().mockResolvedValue(),
            humanDelay: vi.fn().mockResolvedValue(),
            scrapingDelay: vi.fn().mockResolvedValue()
        };
        service = new PolygonIoService(mockPacingManager);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('fetchHistoricalData', () => {
        it('should fetch data and call onChunkReceived', async () => {
            ky.get.mockReturnValue({
                json: vi.fn().mockResolvedValue({ results: [{ c: 100 }] })
            });

            const onChunkReceived = vi.fn();
            await service.fetchHistoricalData('AAPL', 1, 'day', '2026-06-01', '2026-06-08', onChunkReceived);
            
            expect(onChunkReceived).toHaveBeenCalledWith([{ c: 100 }]);
        });

        it('should handle pagination', async () => {
            ky.get.mockReturnValueOnce({
                json: vi.fn().mockResolvedValue({ results: [{ c: 100 }], next_url: 'https://api.polygon.io/next_page' })
            }).mockReturnValueOnce({
                json: vi.fn().mockResolvedValue({ results: [{ c: 101 }] })
            });

            const onChunkReceived = vi.fn();
            await service.fetchHistoricalData('AAPL', 1, 'day', '2026-06-01', '2026-06-08', onChunkReceived);
            
            expect(onChunkReceived).toHaveBeenCalledTimes(2);
            expect(ky.get).toHaveBeenCalledTimes(2);
        });

        it('should throw error on failure', async () => {
            ky.get.mockReturnValue({
                json: vi.fn().mockRejectedValue(new Error('Network error'))
            });

            const onChunkReceived = vi.fn();
            await expect(service.fetchHistoricalData('AAPL', 1, 'day', '2026-06-01', '2026-06-08', onChunkReceived)).rejects.toThrow(/Fehler beim Abrufen/);
        });

        it('should wait on 429 error', async () => {
            const error429 = new Error('Rate limit');
            error429.response = { status: HttpStatus.TOO_MANY_REQUESTS };

            ky.get.mockReturnValueOnce({
                json: vi.fn().mockRejectedValue(error429)
            }).mockReturnValueOnce({
                json: vi.fn().mockResolvedValue({ results: [{ c: 100 }] })
            });

            const onChunkReceived = vi.fn();
            await service.fetchHistoricalData('AAPL', 1, 'day', '2026-06-01', '2026-06-08', onChunkReceived);
            
            expect(mockPacingManager.sleepMs).toHaveBeenCalledWith(65000);
            expect(onChunkReceived).toHaveBeenCalledWith([{ c: 100 }]);
        });
    });

    describe('fetchOptionsContractBars', () => {
        it('should return mapped bars', async () => {
            ky.get.mockReturnValue({
                json: vi.fn().mockResolvedValue({
                    results: [{ t: 1600000000000, v: 10, o: 1, h: 2, l: 0.5, c: 1.5, vw: 1.2, n: 5 }]
                })
            });

            const result = await service.fetchOptionsContractBars('O:AAPL260608C00150000', 15, 'minute', '2026-06-01', '2026-06-08');
            expect(result).toHaveLength(1);
            expect(result[0].close).toBe(1.5);
            expect(result[0].volume).toBe(10);
        });

        it('should handle prefixing with O:', async () => {
            ky.get.mockReturnValue({
                json: vi.fn().mockResolvedValue({ results: [] })
            });

            await service.fetchOptionsContractBars('AAPL260608C00150000', 15, 'minute', '2026-06-01', '2026-06-08');
            expect(ky.get).toHaveBeenCalledWith(expect.stringContaining('O:AAPL260608C00150000'));
        });

        it('should return empty array on non-429 error', async () => {
            ky.get.mockReturnValue({
                json: vi.fn().mockRejectedValue(new Error('Network error'))
            });

            const result = await service.fetchOptionsContractBars('O:AAPL260608C00150000', 15, 'minute', '2026-06-01', '2026-06-08');
            expect(result).toEqual([]);
        });
    });
});
