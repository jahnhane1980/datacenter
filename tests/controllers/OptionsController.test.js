import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OptionsController } from '../../src/controllers/OptionsController.js';
import { SYNC_JOBS } from '../../src/repositories/TickerRepository.js';

describe('OptionsController', () => {
    let mockTickerRepo;
    let mockOptionRepo;
    let mockAlphaVantageService;
    let controller;

    beforeEach(() => {
        mockTickerRepo = { getTickersForJob: vi.fn() };
        mockOptionRepo = { 
            insertAlphaVantageRatios: vi.fn(),
            getAnomalousContracts: vi.fn(),
            getLatestBarTimestampForContract: vi.fn(),
            getOldestBarTimestampForContract: vi.fn(),
            insertHistoricContractBars: vi.fn()
        };
        mockAlphaVantageService = { fetchIntradayRatios: vi.fn() };

        controller = new OptionsController(mockTickerRepo, mockOptionRepo, mockAlphaVantageService);
        
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-06-08T12:00:00Z'));
    });

    describe('runIntraSync', () => {
        it('should abort if no tickers found', async () => {
            mockTickerRepo.getTickersForJob.mockResolvedValue([]);
            await controller.runIntraSync();
            expect(mockAlphaVantageService.fetchIntradayRatios).not.toHaveBeenCalled();
        });

        it('should fetch and insert intraday ratios', async () => {
            mockTickerRepo.getTickersForJob.mockResolvedValue([{ id: 1, name: 'AAPL' }]);
            
            const mockRecords = [{ contract: 'AAPL_C', volume_oi_ratio: 2.5 }];
            mockAlphaVantageService.fetchIntradayRatios.mockResolvedValue(mockRecords);

            await controller.runIntraSync();

            expect(mockAlphaVantageService.fetchIntradayRatios).toHaveBeenCalledWith('AAPL');
            expect(mockOptionRepo.insertAlphaVantageRatios).toHaveBeenCalledWith(1, mockRecords);
        });

        it('should continue if service returns no records', async () => {
            mockTickerRepo.getTickersForJob.mockResolvedValue([{ id: 1, name: 'AAPL' }]);
            mockAlphaVantageService.fetchIntradayRatios.mockResolvedValue([]);

            await controller.runIntraSync();

            expect(mockAlphaVantageService.fetchIntradayRatios).toHaveBeenCalledWith('AAPL');
            expect(mockOptionRepo.insertAlphaVantageRatios).not.toHaveBeenCalled();
        });

        it('should handle errors per ticker gracefully', async () => {
            mockTickerRepo.getTickersForJob.mockResolvedValue([
                { id: 1, name: 'AAPL' },
                { id: 2, name: 'MSFT' }
            ]);
            
            mockAlphaVantageService.fetchIntradayRatios.mockRejectedValueOnce(new Error('API Error'));
            mockAlphaVantageService.fetchIntradayRatios.mockResolvedValueOnce([{ contract: 'MSFT_C' }]);

            await controller.runIntraSync();

            expect(mockAlphaVantageService.fetchIntradayRatios).toHaveBeenCalledWith('AAPL');
            expect(mockAlphaVantageService.fetchIntradayRatios).toHaveBeenCalledWith('MSFT');
            expect(mockOptionRepo.insertAlphaVantageRatios).toHaveBeenCalledWith(2, [{ contract: 'MSFT_C' }]);
        });
    });

    describe('runHistoricSync', () => {
        let mockPolygonService;

        beforeEach(() => {
            mockPolygonService = { fetchOptionsContractBars: vi.fn() };
        });

        it('should abort if no anomalies found', async () => {
            mockOptionRepo.getAnomalousContracts.mockResolvedValue([]);
            await controller.runHistoricSync(mockPolygonService);
            expect(mockOptionRepo.getLatestBarTimestampForContract).not.toHaveBeenCalled();
        });

        it('should fetch from 5 days ago if no prior data exists', async () => {
            mockOptionRepo.getAnomalousContracts.mockResolvedValue([
                { ticker: 1, contract_id: 'AAPL_C' }
            ]);
            mockOptionRepo.getLatestBarTimestampForContract.mockResolvedValue(null);
            mockPolygonService.fetchOptionsContractBars.mockResolvedValue([{ close: 150 }]);

            await controller.runHistoricSync(mockPolygonService);

            // 5 days before 2026-06-08 is 2026-06-03
            expect(mockPolygonService.fetchOptionsContractBars).toHaveBeenCalledWith(
                'AAPL_C', 15, 'minute', '2026-06-03', '2026-06-08'
            );
            expect(mockOptionRepo.insertHistoricContractBars).toHaveBeenCalled();
        });

        it('should fetch from latest date + 1 day if data exists', async () => {
            mockOptionRepo.getAnomalousContracts.mockResolvedValue([
                { ticker: 1, contract_id: 'AAPL_C' }
            ]);
            // Simulated latest date: 2026-06-05
            mockOptionRepo.getLatestBarTimestampForContract.mockResolvedValue('2026-06-05T15:00:00Z');
            mockPolygonService.fetchOptionsContractBars.mockResolvedValue([{ close: 150 }]);

            await controller.runHistoricSync(mockPolygonService);

            // Should start from 2026-06-06
            expect(mockPolygonService.fetchOptionsContractBars).toHaveBeenCalledWith(
                'AAPL_C', 15, 'minute', '2026-06-06', '2026-06-08'
            );
        });
    });

    describe('runBackfillSync', () => {
        let mockPolygonService;

        beforeEach(() => {
            mockPolygonService = { fetchOptionsContractBars: vi.fn() };
        });

        it('should fetch up to oldest date - 1 day', async () => {
            mockOptionRepo.getAnomalousContracts.mockResolvedValue([
                { ticker: 1, contract_id: 'AAPL_C' }
            ]);
            // Oldest date currently is 2026-05-01
            mockOptionRepo.getOldestBarTimestampForContract.mockResolvedValue('2026-05-01T09:30:00Z');
            mockPolygonService.fetchOptionsContractBars.mockResolvedValue([{ close: 150 }]);

            await controller.runBackfillSync(mockPolygonService);

            // Target backfill is 2024-06-08 (2 years prior).
            // To date should be 2026-04-30 (1 day before oldest).
            expect(mockPolygonService.fetchOptionsContractBars).toHaveBeenCalledWith(
                'AAPL_C', 15, 'minute', '2024-06-08', '2026-04-30'
            );
            expect(mockOptionRepo.insertHistoricContractBars).toHaveBeenCalled();
        });

        it('should skip if 2 years of history already exist', async () => {
            mockOptionRepo.getAnomalousContracts.mockResolvedValue([
                { ticker: 1, contract_id: 'AAPL_C' }
            ]);
            // Oldest date is 2024-05-01, meaning toStr would be 2024-04-30, which is < target (2024-06-08)
            mockOptionRepo.getOldestBarTimestampForContract.mockResolvedValue('2024-05-01T09:30:00Z');

            await controller.runBackfillSync(mockPolygonService);

            expect(mockPolygonService.fetchOptionsContractBars).not.toHaveBeenCalled();
        });
    });
});
