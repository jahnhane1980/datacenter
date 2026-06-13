import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { YieldCurveAction } from '../../src/actions/YieldCurveAction.js';

describe('YieldCurveAction', () => {
    let mockFredRepo;
    let mockNotificationService;
    let action;

    beforeEach(() => {
        mockFredRepo = {
            getHistoricalIndicatorValues: vi.fn()
        };
        mockNotificationService = {
            sendNotification: vi.fn().mockResolvedValue()
        };

        action = new YieldCurveAction(mockFredRepo, mockNotificationService);
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should skip alert if not enough history is available', async () => {
        mockFredRepo.getHistoricalIndicatorValues.mockResolvedValue([
            { value: -0.2 } // Only 1 entry
        ]);

        await action.handle({ payload: { date: '2026-06-08', spread: -0.2 } });

        expect(mockNotificationService.sendNotification).not.toHaveBeenCalled();
    });

    it('should send alert with correct steepening trend', async () => {
        // history is sorted descending by date
        const history = new Array(25).fill(0).map((_, i) => ({
            value: -0.5 // 1 month ago it was -0.5
        }));
        // week ago it was -0.3
        history[5].value = -0.3;

        mockFredRepo.getHistoricalIndicatorValues.mockResolvedValue(history);

        await action.handle({ payload: { date: '2026-06-08', spread: -0.1 } });

        expect(mockNotificationService.sendNotification).toHaveBeenCalled();
        const callArgs = mockNotificationService.sendNotification.mock.calls[0][0];
        
        expect(callArgs.title).toBe('📈 Yield Curve Update');
        expect(callArgs.message).toContain('Klares Steepening');
        expect(callArgs.message).toContain('-0.10%'); // today
        expect(callArgs.message).toContain('-0.30%'); // week ago
        expect(callArgs.message).toContain('-0.50%'); // month ago
        expect(callArgs.message).toContain('Invertiert'); // -0.1 is still < 0
    });

    it('should send alert with correct flattening trend and normal status', async () => {
        const history = new Array(25).fill(0).map((_, i) => ({
            value: 0.8 // 1 month ago it was 0.8
        }));
        history[5].value = 0.5; // week ago it was 0.5

        mockFredRepo.getHistoricalIndicatorValues.mockResolvedValue(history);

        // today it's 0.2 (flattening by -0.6)
        await action.handle({ payload: { date: '2026-06-08', spread: 0.2 } });

        expect(mockNotificationService.sendNotification).toHaveBeenCalled();
        const callArgs = mockNotificationService.sendNotification.mock.calls[0][0];
        
        expect(callArgs.message).toContain('Klares Flattening');
        expect(callArgs.message).toContain('Normal');
    });

    it('should send alert with sideways trend', async () => {
        const history = new Array(25).fill(0).map((_, i) => ({
            value: 0.5 // 1 month ago
        }));
        history[5].value = 0.5; // week ago

        mockFredRepo.getHistoricalIndicatorValues.mockResolvedValue(history);

        // today it's 0.52 (change 0.02, sideways)
        await action.handle({ payload: { date: '2026-06-08', spread: 0.52 } });

        expect(mockNotificationService.sendNotification).toHaveBeenCalled();
        const callArgs = mockNotificationService.sendNotification.mock.calls[0][0];
        
        expect(callArgs.message).toContain('Seitwärts');
    });

    it('should handle errors gracefully', async () => {
        mockFredRepo.getHistoricalIndicatorValues.mockRejectedValue(new Error('DB Failed'));

        await action.handle({ payload: { date: '2026-06-08', spread: -0.1 } });

        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Fehler bei der Verarbeitung'), 'DB Failed');
    });
});
