import { describe, it, expect, vi } from 'vitest';
import { createTickerRepository } from '../../src/repositories/TickerRepository.js';
import { supabaseClient } from '../../src/core/SupabaseClient.js';

// Mocken des globalen Supabase-Client Moduls
vi.mock('../../src/core/SupabaseClient.js', () => {
    return {
        supabaseClient: {
            from: vi.fn()
        }
    };
});

describe('TickerRepository', () => {
    
    it('sollte alle Ticker aus der Datenbank abrufen', async () => {
        // ARRANGE (Vorbereitung)
        const mockData = [{ id: 1, name: 'AAPL' }, { id: 2, name: 'TSLA' }];
        
        // Simuliere die chain .from().select()
        const selectMock = vi.fn().mockResolvedValue({ data: mockData, error: null });
        vi.mocked(supabaseClient.from).mockReturnValue({
            select: selectMock
        });

        const repository = createTickerRepository();

        // ACT (Ausführung)
        const result = await repository.getAllTickers();

        // ASSERT (Überprüfung)
        expect(supabaseClient.from).toHaveBeenCalledWith('ticker');
        expect(selectMock).toHaveBeenCalledWith('id, name, ticker_typ_id');
        expect(result).toEqual(mockData);
    });

    it('sollte einen Fehler werfen, wenn die Datenbankabfrage fehlschlägt', async () => {
        // ARRANGE
        const selectMock = vi.fn().mockResolvedValue({ data: null, error: { message: 'Datenbank offline' } });
        vi.mocked(supabaseClient.from).mockReturnValue({
            select: selectMock
        });

        const repository = createTickerRepository();

        // ACT & ASSERT
        await expect(repository.getAllTickers()).rejects.toThrow('[TickerRepository] Fehler beim Abrufen der Ticker: Datenbank offline');
    });

});