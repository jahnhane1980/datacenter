import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ActionRouter } from '../../src/core/ActionRouter.js';

// Dynamische Imports mocken, um Seiteneffekte der Actions zu vermeiden
const mockGenericHandle = vi.fn().mockResolvedValue();
vi.mock('../../src/actions/GenericMacroAction.js', () => ({
    GenericMacroAction: class {
        handle = mockGenericHandle;
    }
}));

const mockNetLiquidityHandle = vi.fn().mockResolvedValue();
vi.mock('../../src/actions/NetLiquidityAction.js', () => ({
    NetLiquidityAction: class {
        handle = mockNetLiquidityHandle;
    }
}));

const mockTreasuryAuctionHandle = vi.fn().mockResolvedValue();
vi.mock('../../src/actions/TreasuryAuctionAction.js', () => ({
    TreasuryAuctionAction: class {
        handle = mockTreasuryAuctionHandle;
    }
}));

describe('ActionRouter', () => {
    let router;
    let mockDb;

    beforeEach(() => {
        mockDb = {};
        router = new ActionRouter(mockDb);
        vi.clearAllMocks();
    });

    it('sollte unbekannte Event-Typen ignorieren und loggen', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        
        await router.execute({ type: 'unknown_event' });
        
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Kein Handler für Event-Typ'));
        expect(mockGenericHandle).not.toHaveBeenCalled();
        expect(mockNetLiquidityHandle).not.toHaveBeenCalled();
        
        consoleSpy.mockRestore();
    });

    it('sollte generic macro events zur GenericMacroAction routen', async () => {
        const events = [
            'central_bank_update',
            'labor_market_update',
            'qra_estimate_added',
            'qra_estimate_updated'
        ];

        for (const type of events) {
            const event = { type };
            await router.execute(event);
            expect(mockGenericHandle).toHaveBeenCalledWith(event);
        }
    });

    it('sollte liquidity_update zur NetLiquidityAction routen', async () => {
        const event = { type: 'liquidity_update' };
        await router.execute(event);
        expect(mockNetLiquidityHandle).toHaveBeenCalledWith(event);
    });

    it('sollte treasury_auction_filled zur TreasuryAuctionAction routen', async () => {
        const event = { type: 'treasury_auction_filled' };
        await router.execute(event);
        expect(mockTreasuryAuctionHandle).toHaveBeenCalledWith(event);
    });
});
