import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createYahooService } from '../../src/services/YahooService.js';
import yahooFinance from 'yahoo-finance2';

vi.mock('yahoo-finance2', () => {
    return {
        default: {
            quoteSummary: vi.fn()
        }
    };
});

describe('YahooService', () => {
    let service;

    beforeEach(() => {
        service = createYahooService();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('fetchQuarterlyFundamentals', () => {
        it('should fetch and return data', async () => {
            const expectedData = { incomeStatementHistoryQuarterly: {} };
            yahooFinance.quoteSummary.mockResolvedValue(expectedData);

            const result = await service.fetchQuarterlyFundamentals('AAPL');
            expect(result).toEqual(expectedData);
            expect(yahooFinance.quoteSummary).toHaveBeenCalledWith('AAPL', expect.any(Object));
        });

        it('should throw error on failure', async () => {
            yahooFinance.quoteSummary.mockRejectedValue(new Error('Network error'));

            await expect(service.fetchQuarterlyFundamentals('AAPL')).rejects.toThrow(/Fehler beim Abrufen/);
        });
    });

    describe('extractMetric', () => {
        it('should return null for empty input', () => {
            expect(service.extractMetric(null)).toBeNull();
            expect(service.extractMetric(undefined)).toBeNull();
        });

        it('should return raw value if present', () => {
            expect(service.extractMetric({ raw: 100 })).toBe(100);
        });

        it('should return value directly if not object with raw', () => {
            expect(service.extractMetric(100)).toBe(100);
            expect(service.extractMetric('value')).toBe('value');
        });
    });
});
