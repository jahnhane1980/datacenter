import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AlphaVantageOptionService } from '../../src/services/AlphaVantageOptionService.js';
import ky from 'ky';

vi.mock('ky', () => {
    return {
        default: {
            create: vi.fn().mockReturnThis(),
            get: vi.fn()
        }
    };
});

describe('AlphaVantageOptionService', () => {
    let service;

    beforeEach(() => {
        vi.useFakeTimers();
        process.env.ALPHAVANTAGE_API_KEY = 'TEST_KEY';
        service = new AlphaVantageOptionService();
        service._burstDelay = vi.fn().mockResolvedValue(); // Bypass delay for tests
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    describe('fetchIntradayRatios', () => {
        it('should return empty array if rate limit exceeded', async () => {
            service.callCounter = 25;
            const result = await service.fetchIntradayRatios('AAPL');
            expect(result).toEqual([]);
        });

        it('should handle API note/warning correctly', async () => {
            ky.get.mockReturnValue({
                json: vi.fn().mockResolvedValue({ Note: 'Limit exceeded' })
            });

            const result = await service.fetchIntradayRatios('AAPL');
            expect(result).toEqual([]);
        });

        it('should handle empty data', async () => {
            ky.get.mockReturnValue({
                json: vi.fn().mockResolvedValue({ data: [] })
            });

            const result = await service.fetchIntradayRatios('AAPL');
            expect(result).toEqual([]);
        });

        it('should fetch and map intraday ratios correctly', async () => {
            ky.get.mockReturnValue({
                json: vi.fn().mockResolvedValue({
                    data: [
                        {
                            contractID: 'C1',
                            symbol: 'AAPL',
                            expiration: '2026-06-08',
                            strike: '150.5',
                            type: 'call',
                            volume_open_interest_ratio: '1.2'
                        }
                    ]
                })
            });

            const result = await service.fetchIntradayRatios('AAPL');
            expect(result).toEqual([{
                contract_id: 'C1',
                symbol: 'AAPL',
                expiration_date: '2026-06-08',
                strike: 150.5,
                option_type: 'CALL',
                volume_oi_ratio: 1.2
            }]);
        });

        it('should return empty array on fetch failure', async () => {
            ky.get.mockReturnValue({
                json: vi.fn().mockRejectedValue(new Error('Network error'))
            });

            const result = await service.fetchIntradayRatios('AAPL');
            expect(result).toEqual([]);
        });
    });

    describe('fetchPutCallRatios', () => {
        it('should return null if rate limit exceeded', async () => {
            service.callCounter = 25;
            const result = await service.fetchPutCallRatios('AAPL');
            expect(result).toBeNull();
        });

        it('should handle API note/warning correctly', async () => {
            ky.get.mockReturnValue({
                json: vi.fn().mockResolvedValue({ Information: 'Limit exceeded' })
            });

            const result = await service.fetchPutCallRatios('AAPL');
            expect(result).toBeNull();
        });

        it('should fetch and map put-call ratios correctly', async () => {
            ky.get.mockReturnValue({
                json: vi.fn().mockResolvedValue({
                    put_call_ratio_full_chain: '0.85',
                    put_call_ratio_by_expiration: [
                        { date: '2026-06-08', value: '0.9' }
                    ]
                })
            });

            const result = await service.fetchPutCallRatios('AAPL');
            expect(result).toEqual({
                full_chain_ratio: 0.85,
                by_expiration: [
                    { expiration_date: '2026-06-08', ratio_value: 0.9 }
                ]
            });
        });

        it('should return null on fetch failure', async () => {
            ky.get.mockReturnValue({
                json: vi.fn().mockRejectedValue(new Error('Network error'))
            });

            const result = await service.fetchPutCallRatios('AAPL');
            expect(result).toBeNull();
        });
    });
});
