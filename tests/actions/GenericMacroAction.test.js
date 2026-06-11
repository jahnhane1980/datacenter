import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GenericMacroAction } from '../../src/actions/GenericMacroAction.js';
import { NotificationService } from '../../src/services/NotificationService.js';
import { LLMService } from '../../src/services/LLMService.js';

vi.mock('../../src/services/NotificationService.js');
vi.mock('../../src/services/LLMService.js');
vi.mock('../../src/managers/PacingManager.js', () => ({
    createPacingManager: vi.fn()
}));

describe('GenericMacroAction', () => {
    let action;
    let mockNotificationSend;
    let mockLlmAnalyze;

    beforeEach(() => {
        vi.clearAllMocks();
        
        mockNotificationSend = vi.fn();
        NotificationService.mockImplementation(function() {
            return { send: mockNotificationSend };
        });

        mockLlmAnalyze = vi.fn();
        LLMService.mockImplementation(function() {
            return { analyzeMacroEvent: mockLlmAnalyze };
        });

        vi.spyOn(console, 'log').mockImplementation(() => {});

        action = new GenericMacroAction();
    });

    it('should call LLM service and send notification on success', async () => {
        const dummyEvent = { type: 'CPI_REPORT', details: { cpi: 3.2 } };
        mockLlmAnalyze.mockResolvedValue('Bullish für Equities');

        await action.handle(dummyEvent);

        expect(mockLlmAnalyze).toHaveBeenCalledWith(dummyEvent);
        expect(mockNotificationSend).toHaveBeenCalledWith(
            'FinanceOS: CPI_REPORT',
            'Bullish für Equities'
        );
    });

    it('should send fallback notification if LLM returns null', async () => {
        const dummyEvent = { type: 'FED_MEETING', details: { rate: 5.5 } };
        mockLlmAnalyze.mockResolvedValue(null);

        await action.handle(dummyEvent);

        expect(mockLlmAnalyze).toHaveBeenCalledWith(dummyEvent);
        expect(mockNotificationSend).toHaveBeenCalledWith(
            'FinanceOS: FED_MEETING',
            `[KI-Analyse fehlgeschlagen]\n\nRohdaten:\n{\n  "rate": 5.5\n}`
        );
    });
});
