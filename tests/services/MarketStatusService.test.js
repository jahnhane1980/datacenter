import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MarketStatusService } from '../../src/services/MarketStatusService.js';

// 1. ARRANGE (Global): Wir mocken das 'ky' Modul komplett weg
vi.mock('ky', () => {
    return {
        default: {
            get: vi.fn()
        }
    };
});

// Importiere den gemockten ky, um die Antworten manipulieren zu können
import ky from 'ky';

describe('MarketStatusService', () => {
    let service;

    beforeEach(() => {
        // Vor jedem Test alle alten Aufrufe löschen
        vi.clearAllMocks();
        service = new MarketStatusService();
    });

    it('sollte true zurückgeben, wenn der Markt als open gemeldet wird', async () => {
        // ARRANGE
        // Wir tun so, als würde ky eine saubere Antwort von Polygon bekommen
        ky.get.mockReturnValue({
            json: vi.fn().mockResolvedValue({ market: 'open' })
        });

        // ACT
        const isOpen = await service.isMarketOpen();

        // ASSERT
        expect(isOpen).toBe(true);
        expect(ky.get).toHaveBeenCalledOnce();
    });

    it('sollte false zurückgeben, wenn der Markt als closed gemeldet wird', async () => {
        // ARRANGE
        ky.get.mockReturnValue({
            json: vi.fn().mockResolvedValue({ market: 'closed' })
        });

        // ACT
        const isOpen = await service.isMarketOpen();

        // ASSERT
        expect(isOpen).toBe(false);
    });

    it('sollte als Fallback true zurückgeben, wenn ein Netzwerkfehler auftritt', async () => {
        // ARRANGE
        ky.get.mockImplementation(() => {
            throw new Error('Netzwerk down');
        });

        // ACT
        const isOpen = await service.isMarketOpen();

        // ASSERT
        expect(isOpen).toBe(true); // Fallback-Logik greift
    });
});