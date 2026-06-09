import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DailyController } from '../../src/controllers/DailyController.js';
import { SYNC_JOBS } from '../../src/repositories/TickerRepository.js';

describe('DailyController', () => {
    let mockTickerRepo;
    let mockCandleRepo;
    let mockPolygonService;
    let controller;

    beforeEach(() => {
        // Mocks für die Repositories und den Service
        mockTickerRepo = {
            getTickersForJob: vi.fn()
        };
        mockCandleRepo = {
            getLatestDailyTimestamp: vi.fn(),
            upsertDailyCandles: vi.fn()
        };
        mockPolygonService = {
            fetchHistoricalData: vi.fn()
        };

        controller = new DailyController(mockTickerRepo, mockCandleRepo, mockPolygonService);
        
        // Timer mocken um konsistente 'heute'-Daten zu haben
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-06-08T12:00:00Z'));
    });

    it('should abort early if no tickers are found', async () => {
        mockTickerRepo.getTickersForJob.mockResolvedValue([]);
        
        await controller.runSync(true);
        
        expect(mockTickerRepo.getTickersForJob).toHaveBeenCalledWith(SYNC_JOBS.DAILY);
        expect(mockCandleRepo.getLatestDailyTimestamp).not.toHaveBeenCalled();
    });

    it('should do a 2-year backfill if no previous data exists', async () => {
        const mockTickers = [{ id: 1, name: 'AAPL', ticker_typ_id: 1 }];
        mockTickerRepo.getTickersForJob.mockResolvedValue(mockTickers);
        mockCandleRepo.getLatestDailyTimestamp.mockResolvedValue(null); // No previous data

        // Simuliere, dass PolygonIoService den Callback mit Chunks aufruft
        mockPolygonService.fetchHistoricalData.mockImplementation(async (name, mul, timespan, from, to, cb) => {
            await cb([{ timestamp: 123, close: 150 }]);
        });

        await controller.runSync(true);

        // Erwartet Backfill von heute vor 2 Jahren (2024-06-08)
        expect(mockPolygonService.fetchHistoricalData).toHaveBeenCalledWith(
            'AAPL', 1, 'day', '2024-06-08', '2026-06-08', expect.any(Function)
        );
        expect(mockCandleRepo.upsertDailyCandles).toHaveBeenCalledWith(1, [{ timestamp: 123, close: 150 }]);
    });

    it('should skip routine sync if market is closed and data is recent (<48h gap)', async () => {
        const mockTickers = [{ id: 1, name: 'AAPL', ticker_typ_id: 1 }];
        mockTickerRepo.getTickersForJob.mockResolvedValue(mockTickers);
        
        // timestamp from 1 hour ago
        const oneHourAgoTs = Math.floor(new Date('2026-06-08T11:00:00Z').getTime() / 1000);
        mockCandleRepo.getLatestDailyTimestamp.mockResolvedValue(oneHourAgoTs);

        // isMarketOpen = false
        await controller.runSync(false);

        // Sollte überspringen, fetchHistoricalData wird nicht aufgerufen
        expect(mockPolygonService.fetchHistoricalData).not.toHaveBeenCalled();
    });
});
