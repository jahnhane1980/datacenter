import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventsController } from '../../src/controllers/EventsController.js';
import { SYNC_JOBS } from '../../src/repositories/TickerRepository.js';

describe('EventsController', () => {
    let mockTickerRepo;
    let mockEventRepo;
    let mockFinnhubService;
    let mockHttpClient;
    let controller;

    beforeEach(() => {
        mockTickerRepo = {
            getTickersForJob: vi.fn()
        };
        mockEventRepo = {
            deleteUpcomingEvents: vi.fn(),
            upsertEvents: vi.fn()
        };
        mockFinnhubService = {
            getEarningsCalendar: vi.fn(),
            getFdaCalendar: vi.fn()
        };
        mockHttpClient = {
            get: vi.fn()
        };

        controller = new EventsController(mockTickerRepo, mockEventRepo, mockFinnhubService, mockHttpClient);
        process.env.NODE_ENV = 'test';
        process.env.ALPHAVANTAGE_API_KEY = 'test';
    });

    describe('runDailySync', () => {
        it('should exit if no tickers found', async () => {
            mockTickerRepo.getTickersForJob.mockResolvedValue([]);
            await controller.runDailySync();
            expect(mockFinnhubService.getEarningsCalendar).not.toHaveBeenCalled();
        });

        it('should fetch events and upsert', async () => {
            mockTickerRepo.getTickersForJob.mockResolvedValue([{ id: 1, name: 'AAPL' }]);
            
            mockFinnhubService.getEarningsCalendar.mockResolvedValue({
                earningsCalendar: [
                    { symbol: 'AAPL', date: '2026-06-15', epsEstimate: 1.5, epsActual: null },
                    { symbol: 'MSFT', date: '2026-06-16' } // Should be skipped (not tracked)
                ]
            });

            mockFinnhubService.getFdaCalendar.mockResolvedValue([
                { symbol: 'AAPL', date: '2026-06-20', description: 'FDA review' }
            ]);

            await controller.runDailySync();

            expect(mockEventRepo.deleteUpcomingEvents).toHaveBeenCalledWith([1], expect.any(String));
            expect(mockEventRepo.upsertEvents).toHaveBeenCalledWith([
                {
                    ticker_id: 1,
                    ticker_name: 'AAPL',
                    event_typ: 'EARNINGS',
                    event_datum: '2026-06-15',
                    beschreibung: 'EPS Estimate: 1.5 | EPS Actual: N/A'
                },
                {
                    ticker_id: 1,
                    ticker_name: 'AAPL',
                    event_typ: 'FDA',
                    event_datum: '2026-06-20',
                    beschreibung: 'FDA review'
                }
            ]);
        });
    });

    describe('runBackfill', () => {
        it('should process historical earnings', async () => {
            mockTickerRepo.getTickersForJob.mockResolvedValue([{ id: 1, name: 'AAPL' }]);
            
            mockHttpClient.get.mockReturnValue({
                json: vi.fn().mockResolvedValue({
                    quarterlyEarnings: [
                        { reportedDate: '2026-01-01', estimatedEPS: 1, reportedEPS: 1.2 }, // After target date
                        { reportedDate: '2023-01-01' } // Before target date
                    ]
                })
            });

            await controller.runBackfill();

            expect(mockEventRepo.upsertEvents).toHaveBeenCalledWith([
                {
                    ticker_id: 1,
                    ticker_name: 'AAPL',
                    event_typ: 'EARNINGS',
                    event_datum: '2026-01-01',
                    beschreibung: 'EPS Estimate: 1 | EPS Actual: 1.2'
                }
            ]);
        });
    });
});
