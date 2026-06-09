import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TradingCalendarBuilder } from '../../../src/core/calendar/TradingCalendarBuilder.js';
import fs from 'fs';

vi.mock('fs');

describe('TradingCalendarBuilder', () => {
    let builder;
    let mockSupabase;

    beforeEach(() => {
        mockSupabase = {
            from: vi.fn().mockReturnThis(),
            upsert: vi.fn().mockResolvedValue({ error: null })
        };
        builder = new TradingCalendarBuilder(mockSupabase);
        vi.clearAllMocks();
    });

    it('should generate a valid calendar and push chunks to database', async () => {
        // mock no exceptions file
        fs.existsSync.mockReturnValue(false);

        // testing just one year
        await builder.buildCalendar(2023, 2023);

        expect(mockSupabase.from).toHaveBeenCalledWith('market_trading_days');
        expect(mockSupabase.upsert).toHaveBeenCalled();
        
        // 365 days in 2023. Upsert should be called.
        const upsertCall = mockSupabase.upsert.mock.calls[0][0];
        expect(upsertCall).toBeInstanceOf(Array);
        expect(upsertCall.length).toBeGreaterThan(0);
        
        const newYearsDay = upsertCall.find(r => r.date === '2023-01-01');
        // Jan 1 2023 is Sunday, so it's a weekend, but also New Year's Day (holiday).
        expect(newYearsDay.is_trading_day).toBe(false);

        const regularDay = upsertCall.find(r => r.date === '2023-01-04'); // Wed
        expect(regularDay.is_trading_day).toBe(true);
    });

    it('should apply exceptions if market_exceptions.json exists', async () => {
        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue(JSON.stringify({
            "2023-01-04": {
                "is_trading_day": false,
                "holiday_name": "Test Holiday",
                "early_close": true
            }
        }));

        await builder.buildCalendar(2023, 2023);

        const upsertCall = mockSupabase.upsert.mock.calls[0][0];
        const exceptionDay = upsertCall.find(r => r.date === '2023-01-04');
        expect(exceptionDay.is_trading_day).toBe(false);
        expect(exceptionDay.holiday_name).toBe('Test Holiday');
        expect(exceptionDay.early_close).toBe(true);
    });
});
