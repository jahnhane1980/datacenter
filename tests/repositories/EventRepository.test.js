import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventRepository } from '../../src/repositories/EventRepository.js';

describe('EventRepository', () => {
    let mockSupabaseClient;
    let repository;

    beforeEach(() => {
        const queryBuilder = {
            delete: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            upsert: vi.fn().mockReturnThis()
        };

        mockSupabaseClient = {
            from: vi.fn().mockReturnValue(queryBuilder)
        };

        repository = new EventRepository(mockSupabaseClient);
    });

    it('should throw on missing supabaseClient', () => {
        expect(() => new EventRepository()).toThrow(/supabaseClient fehlt/);
    });

    describe('deleteUpcomingEvents', () => {
        it('should do nothing if tickerIds is empty', async () => {
            await repository.deleteUpcomingEvents([], '2026-06-08');
            expect(mockSupabaseClient.from).not.toHaveBeenCalled();
        });

        it('should execute delete correctly', async () => {
            mockSupabaseClient.from().gte.mockResolvedValue({ error: null });

            await repository.deleteUpcomingEvents([1, 2], '2026-06-08');

            expect(mockSupabaseClient.from).toHaveBeenCalledWith('market_event_calendar');
            expect(mockSupabaseClient.from().delete).toHaveBeenCalled();
            expect(mockSupabaseClient.from().in).toHaveBeenCalledWith('ticker_id', [1, 2]);
            expect(mockSupabaseClient.from().gte).toHaveBeenCalledWith('event_datum', '2026-06-08');
        });

        it('should throw an error if delete fails', async () => {
            mockSupabaseClient.from().gte.mockResolvedValue({ error: { message: 'DB delete error' } });

            await expect(repository.deleteUpcomingEvents([1], '2026-06-08')).rejects.toThrow(/DB delete error/);
        });
    });

    describe('upsertEvents', () => {
        it('should do nothing if events array is empty', async () => {
            await repository.upsertEvents([]);
            expect(mockSupabaseClient.from).not.toHaveBeenCalled();
        });

        it('should execute upsert correctly', async () => {
            mockSupabaseClient.from().upsert.mockResolvedValue({ error: null });

            const events = [{ ticker_id: 1, event_typ: 'EARNINGS', event_datum: '2026-06-08' }];
            await repository.upsertEvents(events);

            expect(mockSupabaseClient.from).toHaveBeenCalledWith('market_event_calendar');
            expect(mockSupabaseClient.from().upsert).toHaveBeenCalledWith(events, { onConflict: 'ticker_id, event_typ, event_datum' });
        });

        it('should throw an error if upsert fails', async () => {
            mockSupabaseClient.from().upsert.mockResolvedValue({ error: { message: 'Upsert failed' } });

            await expect(repository.upsertEvents([{ ticker_id: 1 }])).rejects.toThrow(/Upsert failed/);
        });
    });
});
