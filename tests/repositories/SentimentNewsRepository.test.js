import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSentimentNewsRepository } from '../../src/repositories/SentimentNewsRepository.js';

describe('SentimentNewsRepository', () => {
    let mockSupabaseClient;
    let repository;

    beforeEach(() => {
        const queryBuilder = {
            select: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            upsert: vi.fn().mockReturnThis()
        };

        mockSupabaseClient = {
            from: vi.fn().mockReturnValue(queryBuilder),
            rpc: vi.fn()
        };

        repository = createSentimentNewsRepository(mockSupabaseClient);
    });

    describe('upsertDailySentiment', () => {
        it('should upsert correctly', async () => {
            mockSupabaseClient.from().upsert.mockResolvedValue({ error: null });

            await repository.upsertDailySentiment('2026-06-08', 'AAPL.US', 10, 0.5);

            expect(mockSupabaseClient.from).toHaveBeenCalledWith('market_sentiment_daily');
            expect(mockSupabaseClient.from().upsert).toHaveBeenCalledWith(
                { observation_date: '2026-06-08', ticker: 'AAPL.US', article_count: 10, normalized_score: 0.5 },
                { onConflict: 'observation_date, ticker' }
            );
        });

        it('should throw error on failure', async () => {
            mockSupabaseClient.from().upsert.mockResolvedValue({ error: { message: 'DB Error' } });

            await expect(repository.upsertDailySentiment('2026-06-08', 'AAPL.US', 10, 0.5)).rejects.toThrow(/DB Error/);
        });
    });

    describe('upsertNewsArticle', () => {
        it('should upsert correctly', async () => {
            mockSupabaseClient.from().upsert.mockResolvedValue({ error: null });

            await repository.upsertNewsArticle('url', '2026-06-08', 'Title', ['tag1'], 0.5);

            expect(mockSupabaseClient.from).toHaveBeenCalledWith('market_news_feed');
            expect(mockSupabaseClient.from().upsert).toHaveBeenCalledWith(
                { article_link: 'url', published_at: '2026-06-08', title: 'Title', tags: ['tag1'], sentiment_polarity: 0.5 },
                { onConflict: 'article_link' }
            );
        });

        it('should throw error on failure', async () => {
            mockSupabaseClient.from().upsert.mockResolvedValue({ error: { message: 'DB Error' } });

            await expect(repository.upsertNewsArticle('url', '2026-06-08', 'Title', ['tag1'], 0.5)).rejects.toThrow(/DB Error/);
        });
    });

    describe('getLatestSentimentDate', () => {
        it('should return date', async () => {
            mockSupabaseClient.from().limit.mockResolvedValue({ data: [{ observation_date: '2026-06-08' }], error: null });

            const result = await repository.getLatestSentimentDate();
            expect(result).toBe('2026-06-08');
        });

        it('should return null if empty', async () => {
            mockSupabaseClient.from().limit.mockResolvedValue({ data: [], error: null });
            const result = await repository.getLatestSentimentDate();
            expect(result).toBeNull();
        });

        it('should throw error on failure', async () => {
            mockSupabaseClient.from().limit.mockResolvedValue({ data: null, error: { message: 'DB Error' } });
            await expect(repository.getLatestSentimentDate()).rejects.toThrow(/DB Error/);
        });
    });

    describe('getLatestNewsDate', () => {
        it('should return date', async () => {
            mockSupabaseClient.from().limit.mockResolvedValue({ data: [{ published_at: '2026-06-08T12:00:00Z' }], error: null });

            const result = await repository.getLatestNewsDate();
            expect(result).toBe('2026-06-08');
        });

        it('should return null if empty', async () => {
            mockSupabaseClient.from().limit.mockResolvedValue({ data: [], error: null });
            const result = await repository.getLatestNewsDate();
            expect(result).toBeNull();
        });

        it('should throw error on failure', async () => {
            mockSupabaseClient.from().limit.mockResolvedValue({ data: null, error: { message: 'DB Error' } });
            await expect(repository.getLatestNewsDate()).rejects.toThrow(/DB Error/);
        });
    });

    describe('getSyncQueue', () => {
        it('should return queue', async () => {
            mockSupabaseClient.from().order.mockResolvedValue({ data: [{ ticker: 'AAPL.US' }], error: null });

            const result = await repository.getSyncQueue();
            expect(result).toEqual([{ ticker: 'AAPL.US' }]);
        });

        it('should throw error on failure', async () => {
            mockSupabaseClient.from().order.mockResolvedValue({ data: null, error: { message: 'DB Error' } });
            await expect(repository.getSyncQueue()).rejects.toThrow(/DB Error/);
        });
    });

    describe('updateSyncQueueTimestamps', () => {
        it('should do nothing if empty', async () => {
            await repository.updateSyncQueueTimestamps([]);
            expect(mockSupabaseClient.from().upsert).not.toHaveBeenCalled();
        });

        it('should upsert correctly', async () => {
            mockSupabaseClient.from().upsert.mockResolvedValue({ error: null });

            await repository.updateSyncQueueTimestamps(['AAPL.US']);
            expect(mockSupabaseClient.from().upsert).toHaveBeenCalledWith(
                expect.arrayContaining([expect.objectContaining({ ticker: 'AAPL.US' })]),
                { onConflict: 'ticker' }
            );
        });

        it('should throw error on failure', async () => {
            mockSupabaseClient.from().upsert.mockResolvedValue({ error: { message: 'DB Error' } });
            await expect(repository.updateSyncQueueTimestamps(['AAPL.US'])).rejects.toThrow(/DB Error/);
        });
    });

    describe('getMissingSentimentDates', () => {
        it('should return missing dates', async () => {
            mockSupabaseClient.rpc.mockResolvedValue({ data: [{ missing_date: '2026-06-08' }], error: null });

            const result = await repository.getMissingSentimentDates('AAPL.US', '2026-06-01', true);
            expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('get_missing_sentiment_dates', {
                target_ticker: 'AAPL.US',
                start_date: '2026-06-01',
                exclude_weekends: true
            });
            expect(result).toEqual(['2026-06-08']);
        });

        it('should return empty array if no data', async () => {
            mockSupabaseClient.rpc.mockResolvedValue({ data: null, error: null });
            const result = await repository.getMissingSentimentDates('AAPL.US', '2026-06-01', true);
            expect(result).toEqual([]);
        });

        it('should throw error on failure', async () => {
            mockSupabaseClient.rpc.mockResolvedValue({ data: null, error: { message: 'DB Error' } });
            await expect(repository.getMissingSentimentDates('AAPL.US', '2026-06-01', true)).rejects.toThrow(/DB Error/);
        });
    });
});
