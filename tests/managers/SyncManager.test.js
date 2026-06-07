import { describe, it, expect, vi } from 'vitest';
import { SyncManager } from '../../src/managers/SyncManager.js';
import { SYNC_JOBS } from '../../src/repositories/TickerRepository.js';

describe('SyncManager - runDailySync', () => {

    it('sollte beim Start die Ticker-Liste aus dem TickerRepository abfragen', async () => {
        // 1. ARRANGE (Vorbereitung)
        // Wir bauen ein Fake-Objekt (Mock), das so tut, als wäre es das TickerRepository
        const mockTickerRepo = {
            getTickersForJob: vi.fn().mockResolvedValue([{ id: 1, name: 'AAPL' }, { id: 2, name: 'TSLA' }])
        };
        
        // Diese brauchen wir für diesen Test noch nicht, aber der Konstruktor erwartet sie
        const mockCandleRepo = {}; 
        const mockPolygonService = {};

        // Wir injizieren die Fakes in den Manager
        const syncManager = new SyncManager(mockTickerRepo, mockCandleRepo, mockPolygonService);

        // 2. ACT (Ausführung)
        await syncManager.runDailySync();

        // 3. ASSERT (Überprüfung)
        // Wir prüfen: Hat der Manager wirklich die Methode aufgerufen?
        expect(mockTickerRepo.getTickersForJob).toHaveBeenCalledWith(SYNC_JOBS.DAILY);
    });

});