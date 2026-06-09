import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ArchiveController } from '../../src/controllers/ArchiveController.js';
import { SYNC_JOBS } from '../../src/repositories/TickerRepository.js';

describe('ArchiveController', () => {
    let mockTickerRepo;
    let mockArchiveRepo;
    let mockSupabase;
    let mockQueryBuilder;
    let controller;

    beforeEach(() => {
        mockTickerRepo = {
            getTickersForJob: vi.fn()
        };

        mockArchiveRepo = {
            upsertM5Candles: vi.fn()
        };

        // Kette für Supabase Mock
        mockQueryBuilder = {
            select: vi.fn().mockReturnThis(),
            delete: vi.fn().mockReturnThis(),
            upsert: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            gt: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn()
        };

        mockSupabase = {
            from: vi.fn().mockReturnValue(mockQueryBuilder)
        };

        controller = new ArchiveController(mockTickerRepo, mockArchiveRepo, mockSupabase);

        // Timer mocken
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-06-09T12:00:00Z'));
    });

    it('should do nothing if no tickers are found', async () => {
        mockTickerRepo.getTickersForJob.mockResolvedValue([]);

        await controller.runM5Archive(30);

        expect(mockTickerRepo.getTickersForJob).toHaveBeenCalledWith(SYNC_JOBS.M5);
        expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('should archive and delete old candles', async () => {
        const mockTickers = [{ id: 1, name: 'AAPL' }];
        mockTickerRepo.getTickersForJob.mockResolvedValue(mockTickers);

        // Mock 1. Batch mit 2 Kerzen
        const mockCandles = [
            { ticker: 1, timestamp: 100 },
            { ticker: 1, timestamp: 200 }
        ];

        // limit() gibt beim ersten Aufruf Daten zurück, beim zweiten Aufruf leer (hasMore = false)
        mockQueryBuilder.limit
            .mockResolvedValueOnce({ data: mockCandles, error: null })
            .mockResolvedValueOnce({ data: [], error: null });

        mockArchiveRepo.upsertM5Candles.mockReturnValue(2); // 2 erfolgreich archiviert
        
        // Mock upsert log
        mockQueryBuilder.upsert.mockResolvedValue({ error: null });
        // Mock delete
        mockQueryBuilder.delete = vi.fn().mockReturnThis();
        // Hier muss das delete query building gemockt werden
        const deleteChain = {
            eq: vi.fn().mockReturnThis(),
            lte: vi.fn().mockResolvedValue({ error: null })
        };
        mockQueryBuilder.delete.mockReturnValue(deleteChain);

        await controller.runM5Archive(30);

        expect(mockArchiveRepo.upsertM5Candles).toHaveBeenCalledWith(mockCandles);
        
        // Sollte Log-Eintrag schreiben (Upsert)
        expect(mockSupabase.from).toHaveBeenCalledWith('archive_market_m5_log');
        
        // Sollte aus market_m5_candles löschen
        expect(mockSupabase.from).toHaveBeenCalledWith('market_m5_candles');
        expect(mockQueryBuilder.delete).toHaveBeenCalled();
    });
});
