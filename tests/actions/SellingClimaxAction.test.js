import { describe, it, expect, vi } from 'vitest';
import { SellingClimaxAction } from '../../src/actions/SellingClimaxAction.js';

describe('SellingClimaxAction', () => {
    it('sollte eine Benachrichtigung senden, wenn das Event valide ist', async () => {
        const mockNotificationService = {
            send: vi.fn()
        };
        const action = new SellingClimaxAction(mockNotificationService);

        const event = {
            type: 'selling_climax_detected',
            payload: {
                ticker: 'PLTR',
                score: 85,
                reasons: ['Grund 1', 'Grund 2']
            }
        };

        await action.handle(event);

        expect(mockNotificationService.send).toHaveBeenCalledTimes(1);
        const sentMessage = mockNotificationService.send.mock.calls[0][0];
        expect(sentMessage).toContain('SELLING CLIMAX ALERT: PLTR');
        expect(sentMessage).toContain('85/100');
        expect(sentMessage).toContain('Grund 1');
    });

    it('sollte nichts tun, wenn das Event ungültig oder der Typ falsch ist', async () => {
        const mockNotificationService = {
            send: vi.fn()
        };
        const action = new SellingClimaxAction(mockNotificationService);

        await action.handle(null);
        await action.handle({ type: 'wrong_event' });

        expect(mockNotificationService.send).not.toHaveBeenCalled();
    });
});
