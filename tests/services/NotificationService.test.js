import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NotificationService } from '../../src/services/NotificationService.js';
import ky from 'ky';

// Mock ky
vi.mock('ky', () => {
    return {
        default: {
            post: vi.fn()
        }
    };
});

describe('NotificationService', () => {
    let originalEnv;

    beforeEach(() => {
        originalEnv = process.env;
        process.env = { ...originalEnv };
        vi.clearAllMocks();
        
        // Console mocks
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        process.env = originalEnv;
        vi.restoreAllMocks();
    });

    it('sollte ntfy als Standard-Provider verwenden und eine Warnung ausgeben, wenn kein Topic existiert', async () => {
        delete process.env.NOTIFICATION_PROVIDER;
        delete process.env.NTFY_TOPIC;
        
        const service = new NotificationService();
        expect(service.provider).toBe('ntfy');
        
        await service.send('Test Subject', 'Test Message');
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Kein NTFY_TOPIC in .env hinterlegt'));
        expect(ky.post).not.toHaveBeenCalled();
    });

    it('sollte ky.post aufrufen, wenn Provider ntfy ist und Topic gesetzt ist', async () => {
        process.env.NOTIFICATION_PROVIDER = 'ntfy';
        process.env.NTFY_TOPIC = 'test_topic_123';
        
        ky.post.mockResolvedValueOnce({ ok: true });

        const service = new NotificationService();
        await service.send('Test Subject', 'Test Message');

        expect(ky.post).toHaveBeenCalledTimes(1);
        expect(ky.post).toHaveBeenCalledWith('https://ntfy.sh/test_topic_123', expect.objectContaining({
            body: 'Test Message',
            headers: expect.objectContaining({
                'Title': 'Test Subject'
            })
        }));
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('test_topic_123'));
    });

    it('sollte Fehler abfangen, wenn ky.post fehlschlägt', async () => {
        process.env.NOTIFICATION_PROVIDER = 'ntfy';
        process.env.NTFY_TOPIC = 'test_topic_123';
        
        ky.post.mockRejectedValueOnce(new Error('Network error'));

        const service = new NotificationService();
        await service.send('Test', 'Test Msg');

        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Fehler beim Senden via ntfy.sh:'), 'Network error');
    });

    it('sollte eine Warnung für unbekannte Provider ausgeben', async () => {
        process.env.NOTIFICATION_PROVIDER = 'unknown_provider';
        
        const service = new NotificationService();
        await service.send('Test', 'Test');
        
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Unbekannter Provider: unknown_provider'));
    });
});
