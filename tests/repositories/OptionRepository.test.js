import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OptionRepository } from '../../src/repositories/OptionRepository.js';

describe('OptionRepository', () => {
    let mockSupabaseClient;
    let repository;

    beforeEach(() => {
        const queryBuilder = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            upsert: vi.fn().mockReturnThis()
        };

        mockSupabaseClient = {
            from: vi.fn().mockReturnValue(queryBuilder)
        };

        repository = new OptionRepository(mockSupabaseClient);
    });

    it('should throw on missing supabaseClient', () => {
        expect(() => new OptionRepository()).toThrow(/supabaseClient fehlt/);
    });

    describe('insertAlphaVantageRatios', () => {
        it('should do nothing if records is empty', async () => {
            await repository.insertAlphaVantageRatios(1, []);
            expect(mockSupabaseClient.from).not.toHaveBeenCalled();
        });

        it('should upsert records correctly', async () => {
            mockSupabaseClient.from().upsert.mockResolvedValue({ error: null });

            const records = [{ symbol: 'AAPL', contract_id: 'C1', expiration_date: '2026-06-08', option_type: 'call', strike: 150, volume_oi_ratio: 1.5 }];
            await repository.insertAlphaVantageRatios(1, records);

            expect(mockSupabaseClient.from).toHaveBeenCalledWith('option_chain_snapshots');
            expect(mockSupabaseClient.from().upsert).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        ticker: 1,
                        ticker_symbol: 'AAPL',
                        contract_id: 'C1',
                        option_type: 'CALL',
                        volume_oi_ratio: 1.5
                    })
                ]),
                { onConflict: 'contract_id,scraped_at' }
            );
        });

        it('should throw error on failure', async () => {
            mockSupabaseClient.from().upsert.mockResolvedValue({ error: { message: 'DB Error' } });

            await expect(repository.insertAlphaVantageRatios(1, [{ symbol: 'A', option_type: 'call' }])).rejects.toThrow(/DB Error/);
        });
    });

    describe('insertHistoricContractBars', () => {
        it('should do nothing if bars is empty', async () => {
            await repository.insertHistoricContractBars(1, 'C1', []);
            expect(mockSupabaseClient.from).not.toHaveBeenCalled();
        });

        it('should upsert records correctly', async () => {
            mockSupabaseClient.from().upsert.mockResolvedValue({ error: null });

            const bars = [{ timestamp: '2026-06-08T12:00:00Z', volume: 100, open: 1, high: 2, low: 0.5, close: 1.5, vwap: 1.2, trade_count: 5 }];
            await repository.insertHistoricContractBars(1, 'c1', bars);

            expect(mockSupabaseClient.from).toHaveBeenCalledWith('option_contract_bars');
            expect(mockSupabaseClient.from().upsert).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        ticker: 1,
                        contract_id: 'C1',
                        volume: 100
                    })
                ]),
                { onConflict: 'contract_id,bar_timestamp' }
            );
        });

        it('should throw error on failure', async () => {
            mockSupabaseClient.from().upsert.mockResolvedValue({ error: { message: 'DB Error' } });

            await expect(repository.insertHistoricContractBars(1, 'c1', [{ timestamp: '2026-06-08T12:00:00Z' }])).rejects.toThrow(/DB Error/);
        });
    });

    describe('getAnomalousContracts', () => {
        it('should return anomalous contracts', async () => {
            mockSupabaseClient.from().gte.mockResolvedValue({ data: [{ ticker: 1, contract_id: 'C1' }], error: null });

            const result = await repository.getAnomalousContracts();
            expect(mockSupabaseClient.from).toHaveBeenCalledWith('option_chain_snapshots');
            expect(mockSupabaseClient.from().gte).toHaveBeenCalledWith('volume_oi_ratio', 1.0);
            expect(result).toEqual([{ ticker: 1, contract_id: 'C1' }]);
        });

        it('should throw error on failure', async () => {
            mockSupabaseClient.from().gte.mockResolvedValue({ data: null, error: { message: 'DB Error' } });

            await expect(repository.getAnomalousContracts()).rejects.toThrow(/DB Error/);
        });
    });

    describe('getLatestBarTimestampForContract', () => {
        it('should return timestamp if found', async () => {
            mockSupabaseClient.from().limit.mockResolvedValue({ data: [{ bar_timestamp: '2026-06-08T12:00:00Z' }], error: null });

            const result = await repository.getLatestBarTimestampForContract('C1');
            expect(mockSupabaseClient.from().eq).toHaveBeenCalledWith('contract_id', 'C1');
            expect(result).toBe('2026-06-08T12:00:00Z');
        });

        it('should return null if not found', async () => {
            mockSupabaseClient.from().limit.mockResolvedValue({ data: [], error: null });

            const result = await repository.getLatestBarTimestampForContract('C1');
            expect(result).toBeNull();
        });

        it('should throw error on failure', async () => {
            mockSupabaseClient.from().limit.mockResolvedValue({ data: null, error: { message: 'DB Error' } });

            await expect(repository.getLatestBarTimestampForContract('C1')).rejects.toThrow(/DB Error/);
        });
    });

    describe('getOldestBarTimestampForContract', () => {
        it('should return timestamp if found', async () => {
            mockSupabaseClient.from().limit.mockResolvedValue({ data: [{ bar_timestamp: '2026-06-08T12:00:00Z' }], error: null });

            const result = await repository.getOldestBarTimestampForContract('C1');
            expect(mockSupabaseClient.from().eq).toHaveBeenCalledWith('contract_id', 'C1');
            expect(result).toBe('2026-06-08T12:00:00Z');
        });

        it('should return null if not found', async () => {
            mockSupabaseClient.from().limit.mockResolvedValue({ data: [], error: null });

            const result = await repository.getOldestBarTimestampForContract('C1');
            expect(result).toBeNull();
        });

        it('should throw error on failure', async () => {
            mockSupabaseClient.from().limit.mockResolvedValue({ data: null, error: { message: 'DB Error' } });

            await expect(repository.getOldestBarTimestampForContract('C1')).rejects.toThrow(/DB Error/);
        });
    });
});
