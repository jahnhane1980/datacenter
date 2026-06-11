import { describe, it, expect, beforeEach } from 'vitest';
import { ControllerRegistry } from '../../src/core/ControllerRegistry.js';

describe('ControllerRegistry', () => {
    let registry;
    let mockDb;
    let mockPacingManager;

    beforeEach(() => {
        mockDb = {};
        mockPacingManager = { enqueue: () => {} };
        registry = new ControllerRegistry(mockDb, mockPacingManager);
    });

    it('sollte einen Fehler werfen, wenn ein unbekannter Controller angefordert wird', async () => {
        await expect(registry.getController('UnknownController'))
            .rejects.toThrow('Unbekannter Controller: UnknownController');
    });

    it('sollte alle registrierten Controller erfolgreich instanziieren können (DI Check)', async () => {
        // Wir iterieren über alle hinterlegten Keys in der Registry
        const controllerNames = Object.keys(registry.registry);
        
        for (const name of controllerNames) {
            const controller = await registry.getController(name);
            
            // Verifizieren, dass das Objekt erzeugt wurde
            expect(controller).toBeDefined();
            
            // Verifizieren, dass die Klasse den korrekten Namen hat
            expect(controller.constructor.name).toBe(name);
        }
    }, 15000); // Großzügiger Timeout, da hier sehr viele Files dynamisch importiert werden
});
