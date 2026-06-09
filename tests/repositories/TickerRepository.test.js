import { describe, it, expect, vi } from 'vitest';
import { createTickerRepository, SYNC_JOBS } from '../../src/repositories/TickerRepository.js';

describe('TickerRepository', () => {
    
    it('sollte das SYNC_JOBS Enum korrekt exportieren und einfrieren', () => {
        expect(SYNC_JOBS).toBeDefined();
        expect(SYNC_JOBS.DAILY).toBe('DAILY');
        expect(Object.isFrozen(SYNC_JOBS)).toBe(true);
    });

    it('sollte alle Ticker aus der Datenbank abrufen', async () => {
        const mockData = [{ id: 1, name: 'AAPL' }, { id: 2, name: 'TSLA' }];
        
        const selectMock = vi.fn().mockResolvedValue({ data: mockData, error: null });
        const fromMock = vi.fn().mockReturnValue({ select: selectMock });
        const mockSupabaseClient = { from: fromMock };

        const repository = createTickerRepository(mockSupabaseClient);

        const result = await repository.getAllTickers();

        expect(fromMock).toHaveBeenCalledWith('ticker');
        expect(selectMock).toHaveBeenCalledWith('id, name, ticker_typ_id');
        expect(result).toEqual(mockData);
    });

    it('sollte einen Fehler werfen, wenn die Datenbankabfrage fehlschlägt', async () => {
        const selectMock = vi.fn().mockResolvedValue({ data: null, error: { message: 'Datenbank offline' } });
        const fromMock = vi.fn().mockReturnValue({ select: selectMock });
        const mockSupabaseClient = { from: fromMock };

        const repository = createTickerRepository(mockSupabaseClient);

        await expect(repository.getAllTickers()).rejects.toThrow('[TickerRepository] Fehler beim Abrufen der Ticker: Datenbank offline');
    });

    it('sollte konfigurierte Ticker für einen bestimmten Job abrufen', async () => {
        const mockConfigRows = [
            { ticker_id: 1, ticker: { id: 1, name: 'AAPL', ticker_typ_id: 3 } },
            { ticker_id: 2, ticker: { id: 2, name: 'TSLA', ticker_typ_id: 3 } }
        ];

        const selectMock = vi.fn().mockReturnThis();
        const eqMock1 = vi.fn().mockReturnThis();
        const eqMock2 = vi.fn().mockResolvedValue({ data: mockConfigRows, error: null });
        
        const fromMock = vi.fn().mockReturnValue({ select: selectMock });
        const mockSupabaseClient = { from: fromMock };

        selectMock.mockReturnValue({ eq: eqMock1 });
        eqMock1.mockReturnValue({ eq: eqMock2 });

        const repository = createTickerRepository(mockSupabaseClient);

        const result = await repository.getTickersForJob(SYNC_JOBS.DAILY);

        expect(fromMock).toHaveBeenCalledWith('ticker_data_config');
        expect(selectMock).toHaveBeenCalledWith(expect.stringContaining('ticker('));
        expect(eqMock1).toHaveBeenCalledWith('sync_type', SYNC_JOBS.DAILY);
        expect(eqMock2).toHaveBeenCalledWith('is_active', true);
        expect(result).toEqual([
            { id: 1, name: 'AAPL', ticker_typ_id: 3 },
            { id: 2, name: 'TSLA', ticker_typ_id: 3 }
        ]);
    });

    it('sollte einen Fehler werfen, wenn getTickersForJob fehlschlägt', async () => {
        const selectMock = vi.fn().mockReturnThis();
        const eqMock1 = vi.fn().mockReturnThis();
        const eqMock2 = vi.fn().mockResolvedValue({ data: null, error: { message: 'DB down' } });

        const fromMock = vi.fn().mockReturnValue({ select: selectMock });
        const mockSupabaseClient = { from: fromMock };

        selectMock.mockReturnValue({ eq: eqMock1 });
        eqMock1.mockReturnValue({ eq: eqMock2 });

        const repository = createTickerRepository(mockSupabaseClient);

        await expect(repository.getTickersForJob(SYNC_JOBS.DAILY)).rejects.toThrow('[TickerRepository] Fehler in getTickersForJob(DAILY): DB down');
    });

});
