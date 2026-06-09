import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CboeController } from '../../src/controllers/CboeController.js';
import { SYNC_JOBS } from '../../src/repositories/TickerRepository.js';

describe('CboeController', () => {
    let mockTickerRepo;
    let mockCboeRepo;
    let mockCboeService;
    let controller;

    beforeEach(() => {
        mockTickerRepo = {
            getTickersForJob: vi.fn()
        };
        mockCboeRepo = {
            getLatestTimestamp: vi.fn(),
            upsertVolumeData: vi.fn()
        };
        mockCboeService = {
            fetchOptionsVolume: vi.fn()
        };

        controller = new CboeController(mockTickerRepo, mockCboeRepo, mockCboeService);
        process.env.NODE_ENV = 'test';
    });

    describe('runSync', () => {
        it('should exit if no tickers configured', async () => {
            mockTickerRepo.getTickersForJob.mockResolvedValue([]);
            await controller.runSync();
            expect(mockCboeRepo.getLatestTimestamp).not.toHaveBeenCalled();
        });

        it('should skip if data is already up to date', async () => {
            mockTickerRepo.getTickersForJob.mockResolvedValue([{ id: 1, name: 'AAPL' }]);
            
            // Setze Timestamp auf morgen (simuliert Lückenlosigkeit)
            const futureTimestamp = Math.floor(Date.now() / 1000) + 86400 * 2; 
            mockCboeRepo.getLatestTimestamp.mockResolvedValue(futureTimestamp);

            await controller.runSync();

            expect(mockCboeService.fetchOptionsVolume).not.toHaveBeenCalled();
        });

        it('should fetch and upsert options volume for valid tickers', async () => {
            mockTickerRepo.getTickersForJob.mockResolvedValue([{ id: 1, name: 'AAPL' }]);
            mockCboeRepo.getLatestTimestamp.mockResolvedValue(null); // Force backfill

            mockCboeService.fetchOptionsVolume.mockResolvedValue([
                { 'Trade Date': '06/08/2026', 'Volume': '5000' },
                { 'Trade Date': '06/09/2026', 'Volume': 'Invalid' } // Should skip invalid
            ]);

            await controller.runSync();

            expect(mockCboeService.fetchOptionsVolume).toHaveBeenCalled();
            expect(mockCboeRepo.upsertVolumeData).toHaveBeenCalledTimes(1);
        });

        it('should handle errors gracefully without crashing the loop', async () => {
            mockTickerRepo.getTickersForJob.mockResolvedValue([{ id: 1, name: 'ERROR_TICKER' }, { id: 2, name: 'OK_TICKER' }]);
            mockCboeRepo.getLatestTimestamp.mockRejectedValueOnce(new Error('DB Fail')); // First fails
            mockCboeRepo.getLatestTimestamp.mockResolvedValueOnce(null); // Second forces backfill

            mockCboeService.fetchOptionsVolume.mockResolvedValue([
                { 'Trade Date': '06/08/2026', 'Volume': '5000' }
            ]);

            await expect(controller.runSync()).resolves.not.toThrow();
            expect(mockCboeRepo.upsertVolumeData).toHaveBeenCalledTimes(1); // the OK ticker worked
        });
    });
});
