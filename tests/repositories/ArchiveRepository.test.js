import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ArchiveRepository } from '../../src/repositories/ArchiveRepository.js';
import { archiveSupabaseClient } from '../../src/core/ArchiveSupabaseClient.js';

// Den Supabase-Client mocken
vi.mock('../../src/core/ArchiveSupabaseClient.js', () => ({
    archiveSupabaseClient: {
        from: vi.fn()
    }
}));

describe('ArchiveRepository', () => {
    let repo;
    let mockQueryBuilder;

    beforeEach(() => {
        repo = new ArchiveRepository();

        mockQueryBuilder = {
            upsert: vi.fn()
        };

        // Die from() Kette vorbereiten
        archiveSupabaseClient.from.mockReturnValue(mockQueryBuilder);
    });

    it('sollte 0 zurückgeben, wenn keine Kerzen übergeben werden', async () => {
        const count = await repo.upsertM5Candles([]);
        expect(count).toBe(0);
        expect(archiveSupabaseClient.from).not.toHaveBeenCalled();
    });

    it('sollte Kerzen per Upsert speichern und die Anzahl zurückgeben', async () => {
        const mockCandles = [{ ticker: 1, timestamp: 100 }, { ticker: 1, timestamp: 200 }];
        mockQueryBuilder.upsert.mockResolvedValue({ error: null });

        const count = await repo.upsertM5Candles(mockCandles);

        expect(archiveSupabaseClient.from).toHaveBeenCalledWith('market_m5_candles');
        expect(mockQueryBuilder.upsert).toHaveBeenCalledWith(mockCandles);
        expect(count).toBe(2);
    });

    it('sollte einen Fehler werfen, wenn Supabase einen Fehler zurückgibt', async () => {
        const mockCandles = [{ ticker: 1, timestamp: 100 }];
        mockQueryBuilder.upsert.mockResolvedValue({ error: { message: 'Netzwerkfehler' } });

        await expect(repo.upsertM5Candles(mockCandles)).rejects.toThrow('Fehler beim Schreiben in die Archiv-Datenbank: Netzwerkfehler');
    });
});
