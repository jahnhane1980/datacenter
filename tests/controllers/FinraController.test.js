import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FinraController } from '../../src/controllers/FinraController.js';
import { SYNC_JOBS } from '../../src/repositories/TickerRepository.js';

describe('FinraController', () => {
    let mockTickerRepo;
    let mockFinraRepo;
    let mockFinraService;
    let controller;

    beforeEach(() => {
        mockTickerRepo = { getTickersForJob: vi.fn() };
        mockFinraRepo = { getLatestTimestamp: vi.fn(), upsertShortData: vi.fn(), getExistingMonths: vi.fn() };
        mockFinraService = { getDownloadLinksForPeriod: vi.fn(), downloadFileContent: vi.fn() };

        controller = new FinraController(mockTickerRepo, mockFinraRepo, mockFinraService);
        
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-06-08T12:00:00Z'));
    });

    it('should abort if no tickers found', async () => {
        mockTickerRepo.getTickersForJob.mockResolvedValue([]);
        await controller.runSync();
        expect(mockFinraRepo.getLatestTimestamp).not.toHaveBeenCalled();
    });

    it('should skip if db is up to date', async () => {
        mockTickerRepo.getTickersForJob.mockResolvedValue([{ id: 1, name: 'AAPL' }]);
        
        // Letztes Datum in DB: 2026-06-08
        const ts = Math.floor(new Date('2026-06-08T00:00:00Z').getTime() / 1000);
        mockFinraRepo.getLatestTimestamp.mockResolvedValue(ts);

        // API liefert Links von gestern oder heute
        mockFinraService.getDownloadLinksForPeriod.mockResolvedValue([
            'http://test/CNMSshvol20260607.txt',
            'http://test/CNMSshvol20260608.txt'
        ]);

        await controller.runSync();
        
        expect(mockFinraService.downloadFileContent).not.toHaveBeenCalled();
    });

    it('should download and parse new files', async () => {
        mockTickerRepo.getTickersForJob.mockResolvedValue([{ id: 1, name: 'AAPL' }]);
        
        // Letztes Datum in DB: 2026-06-06
        const ts = Math.floor(new Date('2026-06-06T00:00:00Z').getTime() / 1000);
        mockFinraRepo.getLatestTimestamp.mockResolvedValue(ts);

        mockFinraService.getDownloadLinksForPeriod.mockImplementation((year, month) => {
            if (month === '06') {
                return Promise.resolve([
                    'http://test/CNMSshvol20260607.txt' // Neu!
                ]);
            }
            return Promise.resolve([]);
        });

        // Mock File Content
        const fileContent = "Date|Symbol|ShortVolume|ShortExemptVolume|TotalVolume|Market\n" +
                            "20260607|AAPL|1000|0|5000|Q";
        mockFinraService.downloadFileContent.mockResolvedValue(fileContent);

        await controller.runSync();

        expect(mockFinraService.downloadFileContent).toHaveBeenCalledWith('http://test/CNMSshvol20260607.txt');
        
        // Ticker AAPL ID = 1. Short=1000, Total=5000
        const expectedTs = Math.floor(new Date('2026-06-07T00:00:00Z').getTime() / 1000);
        expect(mockFinraRepo.upsertShortData).toHaveBeenCalledWith(1, expectedTs, 1000, 5000);
    });

    describe('runBackfill', () => {
        it('should exit if no tickers configured', async () => {
            mockTickerRepo.getTickersForJob.mockResolvedValue([]);
            await controller.runBackfill();
            expect(mockFinraRepo.getExistingMonths).not.toHaveBeenCalled();
        });

        it('should exit if all months are already covered', async () => {
            mockTickerRepo.getTickersForJob.mockResolvedValue([{ id: 1, name: 'AAPL' }]);
            
            // Simuliere, dass alle Monate (April 2026 bis Mai 2024) existieren
            const existingMonths = new Set();
            for(let year = 2024; year <= 2026; year++) {
                for(let month = 1; month <= 12; month++) {
                    existingMonths.add(`${year}-${String(month).padStart(2, '0')}`);
                }
            }
            mockFinraRepo.getExistingMonths.mockResolvedValue(existingMonths);

            await controller.runBackfill();
            expect(mockFinraService.getDownloadLinksForPeriod).not.toHaveBeenCalled();
        });

        it('should process missing months and upsert data', async () => {
            mockTickerRepo.getTickersForJob.mockResolvedValue([{ id: 1, name: 'AAPL' }]);
            
            // Angenommen, April 2026 fehlt
            const existingMonths = new Set(['2026-03', '2026-02']); // etc...
            mockFinraRepo.getExistingMonths.mockResolvedValue(existingMonths);

            mockFinraService.getDownloadLinksForPeriod.mockResolvedValue([
                'http://test/CNMSshvol20260401.txt'
            ]);

            const fileContent = "Date|Symbol|ShortVolume|ShortExemptVolume|TotalVolume|Market\n" +
                                "20260401|AAPL|2000|0|8000|Q";
            mockFinraService.downloadFileContent.mockResolvedValue(fileContent);

            await controller.runBackfill();

            expect(mockFinraService.getDownloadLinksForPeriod).toHaveBeenCalledWith(2026, '04');
            const expectedTs = Math.floor(new Date('2026-04-01T00:00:00Z').getTime() / 1000);
            expect(mockFinraRepo.upsertShortData).toHaveBeenCalledWith(1, expectedTs, 2000, 8000);
        });
    });
});
