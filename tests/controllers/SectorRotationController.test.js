import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SectorRotationController } from '../../src/controllers/SectorRotationController.js';
import { SYNC_JOBS } from '../../src/repositories/TickerRepository.js';

describe('SectorRotationController', () => {
    let mockTickerRepo;
    let mockCandleRepo;
    let mockSectorRepo;
    let controller;

    beforeEach(() => {
        mockTickerRepo = { getTickersForJob: vi.fn() };
        mockCandleRepo = { getDailyCandlesSince: vi.fn() };
        mockSectorRepo = {
            getLatestLogDate: vi.fn(),
            upsertLogs: vi.fn()
        };

        controller = new SectorRotationController(mockTickerRepo, mockCandleRepo, mockSectorRepo);
    });

    describe('_calculateRSI', () => {
        it('should return 50 if prices array is smaller than period+1', () => {
            const result = controller._calculateRSI([1, 2, 3], 5);
            expect(result).toBe(50);
        });

        it('should return 100 if there are no losses', () => {
            // Generiere einen steigenden Trend
            const prices = Array.from({length: 51}, (_, i) => i);
            const result = controller._calculateRSI(prices, 50);
            expect(result).toBe(100);
        });
    });

    describe('runDailySync', () => {
        it('should throw if no log date exists', async () => {
            mockSectorRepo.getLatestLogDate.mockResolvedValue(null);

            await expect(controller.runDailySync()).rejects.toThrow('Kein existierendes Log gefunden.');
        });

        it('should throw if SPY is missing', async () => {
            mockSectorRepo.getLatestLogDate.mockResolvedValue('2026-06-01');
            mockTickerRepo.getTickersForJob.mockResolvedValue([{ id: 1, name: 'SOXX' }]);

            await expect(controller.runDailySync()).rejects.toThrow('SPY fehlt in der geladenen SECTOR_ROTATION Konfiguration!');
        });

        it('should fetch data, process new days and upsert logs', async () => {
            mockSectorRepo.getLatestLogDate.mockResolvedValue('2026-06-01');
            mockTickerRepo.getTickersForJob.mockResolvedValue([
                { id: 1, name: 'SPY' },
                { id: 2, name: 'SOXX' }
            ]);

            // Generiere künstliche Kerzen
            const createCandles = (length, startTimestamp, trend) => {
                return Array.from({ length }, (_, i) => ({
                    timestamp: startTimestamp + (i * 86400),
                    close: 100 + (i * trend)
                }));
            };

            const startTs = 1715000000;
            // 71 Candles -> 70 für Historie, 1 für einen "neuen" Tag
            const spyCandles = createCandles(72, startTs, 0.5); 
            // So machen wir das "neue Datum" (SpyCandles[71]) größer als '2026-06-01'
            spyCandles[71].timestamp = new Date('2026-06-02T12:00:00Z').getTime() / 1000;

            const soxxCandles = createCandles(72, startTs, 1.0);
            soxxCandles[71].timestamp = new Date('2026-06-02T12:00:00Z').getTime() / 1000;

            mockCandleRepo.getDailyCandlesSince.mockImplementation(async (id) => {
                if (id === 1) return spyCandles;
                if (id === 2) return soxxCandles;
                return [];
            });

            await controller.runDailySync();

            expect(mockSectorRepo.upsertLogs).toHaveBeenCalled();
            const upsertCallArgs = mockSectorRepo.upsertLogs.mock.calls[0][0];
            expect(upsertCallArgs.length).toBe(1); // Only SOXX for 1 new day
            expect(upsertCallArgs[0].ticker_name).toBe('SOXX');
        });
    });
});
