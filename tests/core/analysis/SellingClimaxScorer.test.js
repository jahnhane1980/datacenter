import { describe, it, expect } from 'vitest';
import { SellingClimaxScorer } from '../../../src/core/analysis/SellingClimaxScorer.js';

describe('SellingClimaxScorer', () => {

    const generateNormalCandles = (count, baseVolume = 1000) => {
        const candles = [];
        for (let i = 0; i < count; i++) {
            candles.push({
                open: 100,
                high: 102,
                low: 99,
                close: 101, // Recovery from low: 2, Total Range: 3 -> 66% (Bullish Normal Candle)
                volume: baseVolume
            });
        }
        return candles;
    };

    it('sollte 0 Score zurückgeben, wenn nicht genug Kerzen vorhanden sind', () => {
        const candles = generateNormalCandles(10);
        const result = SellingClimaxScorer.calculateScore({ candles });
        expect(result.score).toBe(0);
    });

    it('sollte einen klassischen Hammer-Climax (wie NVTS) erkennen', () => {
        const candles = generateNormalCandles(20, 1000); 
        // Crash Tag (NVTS Style)
        candles.push({
            open: 90,
            high: 92,
            low: 80,   // Intraday Drop > 10%
            close: 89, // Recovery fast 90%
            volume: 4000 // 4x Vol
        });

        const result = SellingClimaxScorer.calculateScore({ candles });

        // 30 (Vol) + 35 (Recovery) + 15 (Drop) = 80
        expect(result.score).toBeGreaterThanOrEqual(80);
        expect(result.isClimax).toBe(true);
        expect(result.reasons.some(r => r.includes('Volumen-Explosion'))).toBe(true);
    });

    it('sollte ein episches Gap-Down-Reversal (wie PLTR) erkennen', () => {
        const candles = generateNormalCandles(20, 1000); 
        
        
        // Überschreibe Tag 20 mit einem niedrigeren Close
        candles[19].close = 74.01;

        // Tag 21 (PLTR Style am 7. April)
        candles.push({
            open: 66.65, // Gap Down von 74.01 (~10%)
            high: 81.80,
            low: 66.12,
            close: 77.84, // Massive Erholung!
            volume: 1500 // 1.5x Vol
        });

        const result = SellingClimaxScorer.calculateScore({ 
            candles,
            shortVolumeRatios: [0.51, 0.44, 0.36], // Short Covering!
            optionsVolume: [50, 50, 50, 50, 110] // Options Panic am selben oder vorherigen Tag
        });

        // 10 (Vol 1.5x) + 35 (Recovery) + 15 (Gap Down) + 20 (Short Covering) + 15 (Options Panic) = 95
        expect(result.score).toBeGreaterThanOrEqual(80);
        expect(result.isClimax).toBe(true);
        expect(result.reasons.some(r => r.includes('Panik-Gap-Down'))).toBe(true);
        expect(result.reasons.some(r => r.includes('Massives Short-Covering'))).toBe(true);
    });

    it('sollte einen normalen Handelstag ignorieren', () => {
        const candles = generateNormalCandles(21, 1000);
        const result = SellingClimaxScorer.calculateScore({ candles });
        // Wick/Recovery > 0.6 gibt 35 Punkte, weil es eine bullische Kerze ist. Aber ohne Drop und ohne Volumen bleibt es bei 35.
        expect(result.score).toBeLessThan(80);
        expect(result.isClimax).toBe(false);
    });
});
