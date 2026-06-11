import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QRAAction } from '../../src/actions/QRAAction.js';

vi.mock('../../src/prompts/alertPrompts.js', () => ({
    getQraMacroAlertSystemPrompt: vi.fn(() => 'system prompt'),
    getQraMacroAlertUserPrompt: vi.fn(() => 'user prompt')
}));

import { getQraMacroAlertUserPrompt } from '../../src/prompts/alertPrompts.js';

describe('QRAAction', () => {
    let mockQraRepo;
    let mockFiscalRepo;
    let mockLlmService;
    let mockNotificationService;
    let action;

    beforeEach(() => {
        mockQraRepo = {
            getLatestEstimateForQuarter: vi.fn(),
            getEstimateForPreviousQuarter: vi.fn()
        };
        mockFiscalRepo = {
            getRecentBillShare: vi.fn()
        };
        mockLlmService = {
            _queryGroq: vi.fn()
        };
        mockNotificationService = {
            sendNotification: vi.fn()
        };
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});

        action = new QRAAction(mockQraRepo, mockFiscalRepo, mockLlmService, mockNotificationService);
    });

    it('should successfully handle QRA event and send notification', async () => {
        const eventData = { targetQuarter: 'Q3 2026' };
        const currentQra = { estimated_net_borrowing: 500e9, consensus_borrowing_median: 480e9 };
        const previousQra = { estimated_net_borrowing: 400e9 };
        
        mockQraRepo.getLatestEstimateForQuarter.mockResolvedValue(currentQra);
        mockQraRepo.getEstimateForPreviousQuarter.mockResolvedValue(previousQra);
        mockFiscalRepo.getRecentBillShare.mockResolvedValue(18.5);
        mockLlmService._queryGroq.mockResolvedValue('LLM Analysis');

        await action.handle(eventData);

        expect(mockQraRepo.getLatestEstimateForQuarter).toHaveBeenCalledWith('Q3 2026');
        expect(mockQraRepo.getEstimateForPreviousQuarter).toHaveBeenCalledWith('Q3 2026');
        expect(mockFiscalRepo.getRecentBillShare).toHaveBeenCalledWith(30);
        expect(getQraMacroAlertUserPrompt).toHaveBeenCalledWith(currentQra, previousQra, 18.5);
        expect(mockLlmService._queryGroq).toHaveBeenCalledWith('system prompt', 'user prompt', false, 400);
        expect(mockNotificationService.sendNotification).toHaveBeenCalledWith({
            title: '🏛️ QRA Macro Alert: Q3 2026',
            message: 'LLM Analysis',
            priority: 4,
            tags: ['bank', 'chart_with_upwards_trend']
        });
    });

    it('should support eventData with new_estimate wrapper', async () => {
        const eventData = { new_estimate: { targetQuarter: 'Q4 2026' } };
        mockQraRepo.getLatestEstimateForQuarter.mockResolvedValue({ estimated_net_borrowing: 500e9 });
        mockQraRepo.getEstimateForPreviousQuarter.mockResolvedValue(null);
        mockFiscalRepo.getRecentBillShare.mockResolvedValue(15.0);
        mockLlmService._queryGroq.mockResolvedValue('Analysis');

        await action.handle(eventData);

        expect(mockQraRepo.getLatestEstimateForQuarter).toHaveBeenCalledWith('Q4 2026');
        expect(mockNotificationService.sendNotification).toHaveBeenCalled();
    });

    it('should log error if current QRA is not found', async () => {
        const eventData = { targetQuarter: 'Q3 2026' };
        mockQraRepo.getLatestEstimateForQuarter.mockResolvedValue(null);

        await action.handle(eventData);

        expect(console.error).toHaveBeenCalledWith(
            '[QRAAction] ❌ Fehler bei der Verarbeitung:',
            'Konnte QRA für Quartal Q3 2026 nicht in der DB finden.'
        );
        expect(mockLlmService._queryGroq).not.toHaveBeenCalled();
    });

    it('should log error if LLM returns empty analysis', async () => {
        const eventData = { targetQuarter: 'Q3 2026' };
        mockQraRepo.getLatestEstimateForQuarter.mockResolvedValue({ estimated_net_borrowing: 500e9 });
        mockQraRepo.getEstimateForPreviousQuarter.mockResolvedValue(null);
        mockFiscalRepo.getRecentBillShare.mockResolvedValue(18.5);
        mockLlmService._queryGroq.mockResolvedValue(null);

        await action.handle(eventData);

        expect(console.error).toHaveBeenCalledWith(
            '[QRAAction] ❌ Fehler bei der Verarbeitung:',
            'LLM gab keine Antwort zurück.'
        );
        expect(mockNotificationService.sendNotification).not.toHaveBeenCalled();
    });
});
