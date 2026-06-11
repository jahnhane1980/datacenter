import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NetLiquidityAction } from '../../src/actions/NetLiquidityAction.js';
import { NotificationService } from '../../src/services/NotificationService.js';
import { LLMService } from '../../src/services/LLMService.js';

vi.mock('../../src/services/NotificationService.js');
vi.mock('../../src/services/LLMService.js');
vi.mock('../../src/managers/PacingManager.js', () => ({
    createPacingManager: vi.fn()
}));

describe('NetLiquidityAction', () => {
    let action;
    let mockNotificationSend;
    let mockLlmQueryGroq;

    beforeEach(() => {
        vi.clearAllMocks();
        
        mockNotificationSend = vi.fn();
        NotificationService.mockImplementation(function() {
            return { send: mockNotificationSend };
        });

        mockLlmQueryGroq = vi.fn();
        LLMService.mockImplementation(function() {
            return { _queryGroq: mockLlmQueryGroq };
        });

        vi.spyOn(console, 'log').mockImplementation(() => {});

        action = new NetLiquidityAction();
    });

    it('should calculate net liquidity and send notification on success', async () => {
        const dummyEvent = {
            details: {
                fed: 7500,
                tga: 500,
                rrp: 1000,
                date: '2026-06-11'
            }
        };
        // Net Liquidity = 7500 - 500 - 1000 = 6000
        mockLlmQueryGroq.mockResolvedValue('Liquidity is up');

        await action.handle(dummyEvent);

        expect(dummyEvent.details.net_liquidity).toBe(6000);
        
        // Assert user prompt contains the added net_liquidity
        const expectedUserPrompt = `Analysiere bitte folgendes Liquiditäts-Update vom 2026-06-11:\n\n${JSON.stringify(dummyEvent.details, null, 2)}`;
        expect(mockLlmQueryGroq).toHaveBeenCalledWith(
            expect.stringContaining('Du bist ein hochqualifizierter quantitativer Makro-Analyst'),
            expectedUserPrompt,
            false,
            300,
            10000
        );

        expect(mockNotificationSend).toHaveBeenCalledWith(
            'FinanceOS: Makro Liquidität Update',
            'Liquidity is up'
        );
    });

    it('should not calculate net liquidity if values are null, and send fallback on llm failure', async () => {
        const dummyEvent = {
            details: {
                fed: null,
                tga: null,
                rrp: null,
                date: '2026-06-12'
            }
        };
        mockLlmQueryGroq.mockResolvedValue(null);

        await action.handle(dummyEvent);

        expect(dummyEvent.details.net_liquidity).toBeUndefined();
        
        expect(mockNotificationSend).toHaveBeenCalledWith(
            'FinanceOS: Makro Liquidität Update',
            `[Net Liquidity KI-Analyse fehlgeschlagen]\n\nRohdaten:\n${JSON.stringify(dummyEvent.details, null, 2)}`
        );
    });
});
