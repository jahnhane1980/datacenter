import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FredController } from '../../src/controllers/FredController.js';
import { FRED_SERIES } from '../../src/services/FredService.js';
import { EventBus } from '../../src/core/EventBus.js';

vi.mock('../../src/core/EventBus.js', () => ({
    EventBus: { emit: vi.fn() }
}));

describe('FredController', () => {
    let mockFredRepo;
    let mockFredService;
    let controller;

    beforeEach(() => {
        mockFredRepo = {
            getLatestObservationDate: vi.fn(),
            getMacroIndicatorDefinitions: vi.fn(),
            upsertMacroData: vi.fn(),
            upsertMacroIndicatorValues: vi.fn()
        };
        mockFredService = {
            fetchObservations: vi.fn()
        };

        const mockPacingManager = {
            sleepMs: vi.fn().mockResolvedValue()
        };

        controller = new FredController(mockFredRepo, mockFredService, mockPacingManager);

        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-06-08T12:00:00Z'));
    });

    describe('runDailySync', () => {
        it('should use latest date from DB if available', async () => {
            mockFredRepo.getLatestObservationDate.mockResolvedValue('2026-06-07');
            mockFredRepo.getMacroIndicatorDefinitions.mockResolvedValue([]);
            
            mockFredService.fetchObservations.mockResolvedValue([]);

            await controller.runDailySync();

            expect(mockFredService.fetchObservations).toHaveBeenCalledWith(FRED_SERIES.TGA_BALANCE, '2026-06-07');
        });

        it('should fallback to 14 days ago if no latest date', async () => {
            mockFredRepo.getLatestObservationDate.mockResolvedValue(null);
            mockFredRepo.getMacroIndicatorDefinitions.mockResolvedValue([]);
            
            mockFredService.fetchObservations.mockResolvedValue([]);

            await controller.runDailySync();

            // 14 days before 2026-06-08 is 2026-05-25
            expect(mockFredService.fetchObservations).toHaveBeenCalledWith(FRED_SERIES.TGA_BALANCE, '2026-05-25');
        });

        it('should fetch data, merge it and upsert to database', async () => {
            mockFredRepo.getLatestObservationDate.mockResolvedValue('2026-06-07');
            mockFredRepo.getMacroIndicatorDefinitions.mockResolvedValue([
                { id: 10, series_id: FRED_SERIES.TGA_BALANCE }
            ]);

            // Simulate one series returning data
            mockFredService.fetchObservations.mockImplementation(async (seriesId) => {
                if (seriesId === FRED_SERIES.TGA_BALANCE) {
                    return [{ date: '2026-06-07', value: '750000' }];
                }
                return [];
            });

            await controller.runDailySync();

            // Legacy Upsert
            expect(mockFredRepo.upsertMacroData).toHaveBeenCalledWith(
                '2026-06-07',
                750000,
                null,
                null,
                null,
                null,
                null
            );

            // Normalized Upsert
            expect(mockFredRepo.upsertMacroIndicatorValues).toHaveBeenCalledWith([
                { indicator_id: 10, observation_date: '2026-06-07', value: 750000 }
            ]);
        });

        it('should fire events for liquidity and yield curve if date is newer', async () => {
            mockFredRepo.getLatestObservationDate.mockResolvedValue('2026-06-07');
            mockFredRepo.getMacroIndicatorDefinitions.mockResolvedValue([]);
            
            // Latest is 2026-06-07. We return data for 2026-06-08 (newer).
            mockFredService.fetchObservations.mockImplementation(async (seriesId) => {
                if (seriesId === FRED_SERIES.TGA_BALANCE) return [{ date: '2026-06-08', value: '750000' }];
                if (seriesId === FRED_SERIES.YIELD_SPREAD_10Y2Y) return [{ date: '2026-06-08', value: '-0.20' }];
                return [];
            });

            await controller.runDailySync();

            expect(EventBus.emit).toHaveBeenCalledWith('FredController', 'liquidity_update', {
                date: '2026-06-08',
                tga: 750000,
                rrp: null,
                fed: null,
                sofr: null
            });

            expect(EventBus.emit).toHaveBeenCalledWith('FredController', 'yield_curve_update', {
                date: '2026-06-08',
                spread: -0.20
            });
        });
        
        it('should skip days with all null values', async () => {
            mockFredRepo.getLatestObservationDate.mockResolvedValue('2026-06-07');
            mockFredRepo.getMacroIndicatorDefinitions.mockResolvedValue([]);

            mockFredService.fetchObservations.mockImplementation(async (seriesId) => {
                return [{ date: '2026-06-07', value: '.' }]; // '.' represents missing/null in FRED
            });

            await controller.runDailySync();

            expect(mockFredRepo.upsertMacroData).not.toHaveBeenCalled();
            expect(mockFredRepo.upsertMacroIndicatorValues).not.toHaveBeenCalled();
        });
    });

    describe('runBackfill', () => {
        it('should use the fixed start date 2021-01-01', async () => {
            mockFredRepo.getLatestObservationDate.mockResolvedValue('2026-06-07');
            mockFredRepo.getMacroIndicatorDefinitions.mockResolvedValue([]);
            
            mockFredService.fetchObservations.mockResolvedValue([]);

            await controller.runBackfill();

            expect(mockFredService.fetchObservations).toHaveBeenCalledWith(FRED_SERIES.TGA_BALANCE, '2021-01-01');
        });
    });
});
