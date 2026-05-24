import { describe, it, expect, vi } from 'vitest';
import { TickerRepository } from '../../src/repositories/TickerRepository.js';

describe('TickerRepository', () => {
    
    it('sollte alle Ticker aus der Datenbank abrufen', async () => {
        // ARRANGE (Vorbereitung)
        const mockData = [{ id: 1, name: 'AAPL' }, { id: 2, name: 'TSLA' }];
        
        // Wir bauen einen Fake-Supabase-Client, der die Chain .from().select() nachahmt
        const mockSupabaseClient = {
            from: vi.fn().mockReturnThis(),
            select: vi.fn().mockResolvedValue({ data: mockData, error: null })
        };

        const repository = new TickerRepository(mockSupabaseClient);

        // ACT (Ausführung)
        const result = await repository.getAllTickers();

        // ASSERT (Überprüfung)
        expect(mockSupabaseClient.from).toHaveBeenCalledWith('ticker');
        expect(mockSupabaseClient.select).toHaveBeenCalledWith('id, name');
        expect(result).toEqual(mockData);
    });

    it('sollte einen Fehler werfen, wenn die Datenbankabfrage fehlschlägt', async () => {
        // ARRANGE
        const mockSupabaseClient = {
            from: vi.fn().mockReturnThis(),
            select: vi.fn().mockResolvedValue({ data: null, error: { message: 'Datenbank offline' } })
        };

        const repository = new TickerRepository(mockSupabaseClient);

        // ACT & ASSERT
        await expect(repository.getAllTickers()).rejects.toThrow('Fehler beim Abrufen der Ticker: Datenbank offline');
    });

});