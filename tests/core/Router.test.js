import { describe, it, expect, vi } from 'vitest';
import { Router } from '../../src/core/Router.js';

describe('Router', () => {
    it('should initialize routes properly', () => {
        const router = new Router({});
        expect(Object.keys(router.routes).length).toBeGreaterThan(0);
        expect(router.routes['daily:sync']).toBeDefined();
        expect(router.routes['finra:sync']).toBeDefined();
        expect(router.routes['options:intra']).toBeDefined();
    });

    it('should throw error for unknown route', async () => {
        const router = new Router({});
        await expect(router.execute('unknown', 'mode')).rejects.toThrow(/Unbekannte Route: \[unknown:mode\]/);
    });

    it('should execute known route', async () => {
        const router = new Router({});
        
        // Mock the bound function for a specific route to prevent actual execution
        const mockAction = vi.fn().mockResolvedValue();
        router.routes['test:route'] = mockAction;

        await router.execute('test', 'route');
        expect(mockAction).toHaveBeenCalledTimes(1);
    });
});
