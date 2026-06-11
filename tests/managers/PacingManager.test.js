import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PacingManager, createPacingManager } from '../../src/managers/PacingManager.js';

describe('PacingManager', () => {
    let manager;
    const originalEnv = process.env.NODE_ENV;

    beforeEach(() => {
        manager = createPacingManager();
        vi.useFakeTimers();
        // Spy on sleepMs and sleepSeconds to check if they are called correctly
        vi.spyOn(manager, 'sleepMs');
        vi.spyOn(manager, 'sleepSeconds');
        
        // Mock console.log for clean output
        vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
        process.env.NODE_ENV = originalEnv; // Reset to original
    });

    describe('createPacingManager', () => {
        it('should return a new instance of PacingManager', () => {
            const newManager = createPacingManager();
            expect(newManager).toBeInstanceOf(PacingManager);
        });
    });

    describe('sleepMs & sleepSeconds', () => {
        it('should sleep for given ms', async () => {
            const promise = manager.sleepMs(500);
            vi.advanceTimersByTime(500);
            await expect(promise).resolves.toBeUndefined();
        });

        it('should sleep for given seconds', async () => {
            const promise = manager.sleepSeconds(2);
            vi.advanceTimersByTime(2000);
            await expect(promise).resolves.toBeUndefined();
            expect(manager.sleepMs).toHaveBeenCalledWith(2000);
        });
    });

    describe('humanDelay', () => {
        it('should return immediately if NODE_ENV is test', async () => {
            process.env.NODE_ENV = 'test';
            await manager.humanDelay(5, 10);
            expect(manager.sleepMs).not.toHaveBeenCalled();
        });

        it('should call sleepMs with a random time within bounds when not in test env', async () => {
            process.env.NODE_ENV = 'production';
            vi.spyOn(Math, 'random').mockReturnValue(0.5); // (15 - 5 + 1) = 11 * 0.5 = 5.5 -> floor = 5 + 5 = 10 sec = 10000ms

            const promise = manager.humanDelay(5, 15);
            vi.advanceTimersByTime(10000);
            await promise;

            expect(manager.sleepMs).toHaveBeenCalledWith(10000);
        });
    });

    describe('scrapingDelay', () => {
        it('should return immediately if NODE_ENV is test', async () => {
            process.env.NODE_ENV = 'test';
            await manager.scrapingDelay();
            expect(manager.sleepSeconds).not.toHaveBeenCalled();
        });

        it('should delay without coffee break', async () => {
            process.env.NODE_ENV = 'production';
            
            // wir brauchen Math.random zwei mal:
            // 1. für seconds (90 - 45 + 1) + 45
            // 2. für isCoffeeBreak (< 0.15)
            // Mock sequence: 0.5 (seconds = 68), 0.2 (no coffee break)
            vi.spyOn(Math, 'random')
                .mockReturnValueOnce(0.5)
                .mockReturnValueOnce(0.2);

            const promise = manager.scrapingDelay();
            vi.advanceTimersByTime(68000);
            await promise;

            expect(manager.sleepSeconds).toHaveBeenCalledWith(68);
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Verdaddle Zeit'));
        });

        it('should delay with coffee break', async () => {
            process.env.NODE_ENV = 'production';
            
            // Mock sequence: 
            // 1. 0.5 (seconds = 68)
            // 2. 0.1 (coffee break! < 0.15)
            // 3. 0.5 for extra coffee time: (240 - 120 + 1) = 121 * 0.5 = 60.5 -> floor = 60 + 120 = 180
            // finalSeconds = 68 + 180 = 248
            vi.spyOn(Math, 'random')
                .mockReturnValueOnce(0.5)
                .mockReturnValueOnce(0.1)
                .mockReturnValueOnce(0.5);

            const promise = manager.scrapingDelay();
            vi.advanceTimersByTime(248000);
            await promise;

            expect(manager.sleepSeconds).toHaveBeenCalledWith(248);
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Hole kurz Kaffee'));
        });
    });
});
