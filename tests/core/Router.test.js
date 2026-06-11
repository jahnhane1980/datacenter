import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Router } from '../../src/core/Router.js';

// Dynamische Service-Imports mocken, die in bestimmten Routen geladen werden
const mockIsMarketOpen = vi.fn().mockResolvedValue(true);
vi.mock('../../src/services/MarketStatusService.js', () => ({
    MarketStatusService: class {
        isMarketOpen = mockIsMarketOpen;
    }
}));

vi.mock('../../src/services/PolygonIoService.js', () => ({
    PolygonIoService: class {}
}));

const mockBuildCalendar = vi.fn().mockResolvedValue();
vi.mock('../../src/core/calendar/TradingCalendarBuilder.js', () => ({
    TradingCalendarBuilder: class {
        buildCalendar = mockBuildCalendar;
    }
}));

describe('Router', () => {
    let router;
    let mockController;

    beforeEach(() => {
        router = new Router({});
        
        // Generischer Controller Mock, der auf alle Methodenaufrufe antwortet
        mockController = {
            runSync: vi.fn().mockResolvedValue(),
            runDailySync: vi.fn().mockResolvedValue(),
            runBackfill: vi.fn().mockResolvedValue(),
            runM5Archive: vi.fn().mockResolvedValue(),
            runBackfillSync: vi.fn().mockResolvedValue(),
            runHistoricSync: vi.fn().mockResolvedValue(),
            runIntraSync: vi.fn().mockResolvedValue(),
            runRegulationCheck: vi.fn().mockResolvedValue(),
            runCikSync: vi.fn().mockResolvedValue(),
            runMasterSync: vi.fn().mockResolvedValue()
        };
        
        // Den Controller-Factory-Aufruf mocken
        vi.spyOn(router.factory, 'getController').mockResolvedValue(mockController);
        
        // Logs unterdrücken, um den Test-Output sauber zu halten
        vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('sollte einen Fehler bei einer unbekannten Route werfen', async () => {
        await expect(router.execute('unknown', 'mode')).rejects.toThrow(/Unbekannte Route: \[unknown:mode\]/);
    });

    it('sollte die Routen korrekt initialisiert haben', () => {
        expect(Object.keys(router.routes).length).toBeGreaterThan(0);
        expect(router.routes['daily:sync']).toBeDefined();
    });

    it('sollte ausnahmslos jede definierte Route erfolgreich ausführen (Full Coverage Check)', async () => {
        const routeKeys = Object.keys(router.routes);
        
        // Teste dynamisch alle hinterlegten Routen
        for (const route of routeKeys) {
            const [task, mode] = route.split(':');
            
            // Die Route ausführen (sollte dank Mocks fehlerfrei durchlaufen)
            await expect(router.execute(task, mode)).resolves.not.toThrow();
        }
        
        // Spezifische Assertions für Routen mit dynamischen Abhängigkeiten
        expect(mockIsMarketOpen).toHaveBeenCalled(); // Wird in daily:sync & m5:sync aufgerufen
        expect(mockBuildCalendar).toHaveBeenCalledWith(2000, 2050); // market-calendar:sync
        
        // Da wir alle Routen ausgeführt haben, sollte getController mehrfach gerufen worden sein
        expect(router.factory.getController).toHaveBeenCalled();
    });
});
