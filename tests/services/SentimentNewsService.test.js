import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSentimentNewsService } from '../../src/services/SentimentNewsService.js';
import ky from 'ky';

vi.mock('ky');

describe('SentimentNewsService', () => {
    let service;

    beforeEach(() => {
        process.env.FINNHUB_API_KEY = 'TEST_KEY';
        service = createSentimentNewsService('TEST_KEY');
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should throw if no apiKey provided', () => {
        delete process.env.FINNHUB_API_KEY;
        expect(() => createSentimentNewsService(null)).toThrow(/FINNHUB_API_KEY ist nicht definiert/);
        process.env.FINNHUB_API_KEY = 'TEST_KEY';
    });

    describe('fetchNews', () => {
        it('should fetch and map news correctly', async () => {
            ky.get.mockReturnValue({
                json: vi.fn().mockResolvedValue([
                    {
                        headline: 'Good News',
                        summary: 'Market is up',
                        datetime: 1600000000,
                        url: 'http://url',
                        category: 'general'
                    }
                ])
            });

            const result = await service.fetchNews('general');
            expect(result).toHaveLength(1);
            expect(result[0].title).toBe('Good News');
            expect(result[0].link).toBe('http://url');
            expect(result[0].sentiment.polarity).toBeGreaterThan(0);
        });

        it('should throw error on failure', async () => {
            ky.get.mockReturnValue({
                json: vi.fn().mockRejectedValue(new Error('Network error'))
            });

            await expect(service.fetchNews('general')).rejects.toThrow(/Network error/);
        });
    });

    describe('fetchSentiments', () => {
        it('should aggregate sentiments correctly', async () => {
            ky.get.mockReturnValue({
                json: vi.fn().mockResolvedValue([
                    {
                        headline: 'Good News',
                        summary: 'Market is up',
                        datetime: 1780876800, // 2026-06-08T00:00:00.000Z
                    },
                    {
                        headline: 'Bad News',
                        summary: 'Market is down',
                        datetime: 1780876800, // Same day
                    }
                ])
            });

            const result = await service.fetchSentiments(['AAPL.US'], '2026-06-01', '2026-06-08');
            expect(result['AAPL.US']).toHaveLength(1);
            expect(result['AAPL.US'][0].date).toBe('2026-06-08');
            expect(result['AAPL.US'][0].count).toBe(2);
            expect(typeof result['AAPL.US'][0].normalized).toBe('number');
        });

        it('should throw error on failure', async () => {
            ky.get.mockReturnValue({
                json: vi.fn().mockRejectedValue(new Error('Network error'))
            });

            await expect(service.fetchSentiments(['AAPL.US'], '2026-06-01')).rejects.toThrow(/Finnhub Fehler für AAPL.US: Network error/);
        });
    });
});
