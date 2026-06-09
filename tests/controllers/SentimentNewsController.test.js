import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SentimentNewsController } from '../../src/controllers/SentimentNewsController.js';

vi.mock('../../src/services/SentimentNewsService.js', () => ({
    SENTIMENT_STATIC_WATCHLIST: { MACRO: [], CRYPTO: [] }
}));

describe('SentimentNewsController', () => {
    let mockTickerRepo;
    let mockSentimentNewsRepo;
    let mockSentimentNewsService;
    let controller;

    beforeEach(() => {
        mockTickerRepo = { getTickersForJob: vi.fn() };
        mockSentimentNewsRepo = {
            getSyncQueue: vi.fn(),
            upsertDailySentiment: vi.fn(),
            updateSyncQueueTimestamps: vi.fn(),
            upsertNewsArticle: vi.fn(),
            getMissingSentimentDates: vi.fn()
        };
        mockSentimentNewsService = {
            fetchSentiments: vi.fn(),
            fetchNews: vi.fn()
        };

        controller = new SentimentNewsController(mockTickerRepo, mockSentimentNewsRepo, mockSentimentNewsService);
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-06-08T12:00:00Z'));
    });

    describe('runDailySync', () => {
        it('should fetch and process sentiments and news correctly', async () => {
            mockTickerRepo.getTickersForJob.mockResolvedValue([{ name: 'AAPL' }]);
            
            // Sync Queue liefert für AAPL.US ein letztes Sync-Datum
            mockSentimentNewsRepo.getSyncQueue.mockResolvedValue([
                { ticker: 'AAPL.US', last_sync_at: '2026-06-07T12:00:00Z' }
            ]);

            mockSentimentNewsService.fetchSentiments.mockResolvedValue({
                'AAPL.US': [{ date: '2026-06-08', count: 10, normalized: 0.5 }]
            });

            mockSentimentNewsService.fetchNews.mockResolvedValue([
                { link: 'url', date: '2026-06-08', title: 'News', tags: 'tech', sentiment: { polarity: 0.8 } }
            ]);

            await controller.runDailySync();

            expect(mockSentimentNewsService.fetchSentiments).toHaveBeenCalled();
            expect(mockSentimentNewsRepo.upsertDailySentiment).toHaveBeenCalledWith('2026-06-08', 'AAPL.US', 10, 0.5);
            expect(mockSentimentNewsRepo.updateSyncQueueTimestamps).toHaveBeenCalled();
            
            expect(mockSentimentNewsService.fetchNews).toHaveBeenCalledWith('general');
            expect(mockSentimentNewsRepo.upsertNewsArticle).toHaveBeenCalledWith('url', '2026-06-08', 'News', 'tech', 0.8);
        });

        it('should throw an error if a ticker fails to process to ensure workflow fails', async () => {
            mockTickerRepo.getTickersForJob.mockResolvedValue([{ name: 'FAIL' }]);
            mockSentimentNewsRepo.getSyncQueue.mockResolvedValue([]);
            
            // Simuliere einen API-Fehler für Sentiments
            mockSentimentNewsService.fetchSentiments.mockRejectedValue(new Error('API Down'));
            mockSentimentNewsService.fetchNews.mockResolvedValue([]);

            await expect(controller.runDailySync()).rejects.toThrow('Sync abgeschlossen mit Fehlern');
        });
    });

    describe('runBackfill', () => {
        it('should fetch backfill data for missing dates', async () => {
            mockTickerRepo.getTickersForJob.mockResolvedValue([{ name: 'AAPL' }]);
            
            // Simuliere Lücken
            mockSentimentNewsRepo.getMissingSentimentDates.mockResolvedValue(['2025-06-01', '2025-06-02']); // 01 war Sonntag, wird gefiltert?
            
            // mock Date-Holidays indirekt, indem wir annehmen, dass Mo, 02.06.2025 durchkommt
            
            mockSentimentNewsService.fetchSentiments.mockResolvedValue({
                'AAPL.US': [{ date: '2025-06-02', count: 5, normalized: 0.1 }]
            });
            mockSentimentNewsService.fetchNews.mockResolvedValue([]);

            await controller.runBackfill();

            expect(mockSentimentNewsService.fetchSentiments).toHaveBeenCalled();
            expect(mockSentimentNewsRepo.upsertDailySentiment).toHaveBeenCalled();
        });
        
        it('should stop backfill on rate limit (429)', async () => {
            mockTickerRepo.getTickersForJob.mockResolvedValue([{ name: 'AAPL' }]);
            mockSentimentNewsRepo.getMissingSentimentDates.mockResolvedValue(['2025-06-02']);
            
            const error429 = new Error('Too Many Requests');
            error429.response = { status: 429 };
            mockSentimentNewsService.fetchSentiments.mockRejectedValue(error429);

            await controller.runBackfill();

            // Es sollte nach dem 429er Fehler nicht mehr fetchNews aufrufen
            expect(mockSentimentNewsService.fetchNews).not.toHaveBeenCalled();
        });
    });
});
