import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LaborMarketController } from '../../src/controllers/LaborMarketController.js';

describe('LaborMarketController', () => {
    let mockLaborMarketRepo;
    let mockLaborMarketService;
    let controller;

    beforeEach(() => {
        mockLaborMarketRepo = {
            getSeries: vi.fn(),
            getLatestDate: vi.fn(),
            upsertDataPoint: vi.fn()
        };
        mockLaborMarketService = {
            fetchSeriesData: vi.fn()
        };

        controller = new LaborMarketController(mockLaborMarketRepo, mockLaborMarketService);
    });

    describe('runDailySync', () => {
        it('should fetch delta and upsert data points as preliminary', async () => {
            mockLaborMarketRepo.getSeries.mockResolvedValue([
                { id: 'PAYEMS', name: 'Nonfarm Payrolls', category: 'Employment', frequency: 'M' }
            ]);
            mockLaborMarketRepo.getLatestDate.mockResolvedValue('2026-05-01');

            mockLaborMarketService.fetchSeriesData.mockResolvedValue([
                { date: '2026-06-01', value: '150000', realtime_start: '2026-07-05' },
                { date: '2026-06-02', value: '.', realtime_start: '2026-07-05' } // Should be skipped
            ]);

            await controller.runDailySync();

            expect(mockLaborMarketService.fetchSeriesData).toHaveBeenCalledWith('PAYEMS', '2026-05-01');
            expect(mockLaborMarketRepo.upsertDataPoint).toHaveBeenCalledWith(
                'PAYEMS', '2026-06-01', '2026-07-05', 150000, true
            );
            expect(mockLaborMarketRepo.upsertDataPoint).toHaveBeenCalledTimes(1);
        });
    });

    describe('runBackfill', () => {
        it('should fetch history from 2000 and upsert as final', async () => {
            mockLaborMarketRepo.getSeries.mockResolvedValue([
                { id: 'PAYEMS' }
            ]);

            mockLaborMarketService.fetchSeriesData.mockResolvedValue([
                { date: '2000-01-01', value: '130000', realtime_start: '2000-02-05' }
            ]);

            await controller.runBackfill();

            expect(mockLaborMarketService.fetchSeriesData).toHaveBeenCalledWith('PAYEMS', '2000-01-01');
            expect(mockLaborMarketRepo.upsertDataPoint).toHaveBeenCalledWith(
                'PAYEMS', '2000-01-01', '2000-02-05', 130000, false
            );
        });
    });
});
