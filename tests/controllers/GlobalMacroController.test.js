import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GlobalMacroController } from '../../src/controllers/GlobalMacroController.js';

describe('GlobalMacroController', () => {
    let mockGlobalRepo;
    let mockGlobalService;
    let controller;

    beforeEach(() => {
        mockGlobalRepo = {
            getDefinitions: vi.fn(),
            getLatestGlobalDate: vi.fn(),
            upsertGlobalData: vi.fn(),
            getLatestFxDate: vi.fn(),
            upsertFxRate: vi.fn()
        };
        mockGlobalService = {
            fetchSeriesData: vi.fn()
        };

        controller = new GlobalMacroController(mockGlobalRepo, mockGlobalService);
    });

    describe('runDailySync', () => {
        it('should fetch and upsert central bank and fx data', async () => {
            mockGlobalRepo.getDefinitions.mockResolvedValue([
                { id: 1, series_id: 'SERIES1', region: 'US' }
            ]);
            mockGlobalRepo.getLatestGlobalDate.mockResolvedValue('2026-06-01');
            mockGlobalRepo.getLatestFxDate.mockResolvedValue('2026-06-01');

            mockGlobalService.fetchSeriesData.mockImplementation(async (seriesId) => {
                if (seriesId === 'SERIES1') {
                    return [
                        { date: '2026-06-02', value: '100' },
                        { date: '2026-06-03', value: '.' } // Should skip
                    ];
                }
                return [{ date: '2026-06-02', value: '1.1' }];
            });

            await controller.runDailySync();

            expect(mockGlobalService.fetchSeriesData).toHaveBeenCalledWith('SERIES1', '2026-06-01');
            expect(mockGlobalRepo.upsertGlobalData).toHaveBeenCalledWith(1, '2026-06-02', 100);
            expect(mockGlobalRepo.upsertGlobalData).toHaveBeenCalledTimes(1);

            expect(mockGlobalService.fetchSeriesData).toHaveBeenCalledWith('DEXUSEU', '2026-06-01');
            expect(mockGlobalRepo.upsertFxRate).toHaveBeenCalledWith('2026-06-02', 'EURUSD', 1.1);
        });
    });

    describe('runBackfill', () => {
        it('should fetch from 2010-01-01', async () => {
            mockGlobalRepo.getDefinitions.mockResolvedValue([
                { id: 1, series_id: 'SERIES1', region: 'US' }
            ]);

            mockGlobalService.fetchSeriesData.mockResolvedValue([
                { date: '2010-01-02', value: '50' }
            ]);

            await controller.runBackfill();

            expect(mockGlobalService.fetchSeriesData).toHaveBeenCalledWith('SERIES1', '2010-01-01');
            expect(mockGlobalRepo.upsertGlobalData).toHaveBeenCalledWith(1, '2010-01-02', 50);

            expect(mockGlobalService.fetchSeriesData).toHaveBeenCalledWith('DEXUSEU', '2010-01-01');
            expect(mockGlobalRepo.upsertFxRate).toHaveBeenCalledWith('2010-01-02', 'EURUSD', 50);
        });
    });
});
