import { describe, it, expect } from 'vitest';
import { DateHelper } from '../../src/core/DateHelper.js';

describe('DateHelper', () => {
    it('toSqlDate should format date correctly', () => {
        const date = new Date('2024-05-10T12:00:00Z');
        expect(DateHelper.toSqlDate(date)).toBe('2024-05-10');
    });

    it('toUnixTimestamp should convert date correctly', () => {
        const date = new Date('2024-05-10T12:00:00Z');
        expect(DateHelper.toUnixTimestamp(date)).toBe(1715342400); // UTC timestamp
        expect(DateHelper.toUnixTimestamp('2024-05-10T12:00:00Z')).toBe(1715342400);
    });

    it('fromUnixTimestamp should convert timestamp correctly', () => {
        const date = DateHelper.fromUnixTimestamp(1715342400);
        expect(date.toISOString()).toBe('2024-05-10T12:00:00.000Z');
    });

    it('getYearsAgo should subtract years correctly', () => {
        const fromDate = new Date('2024-05-10T12:00:00Z');
        const twoYearsAgo = DateHelper.getYearsAgo(2, fromDate);
        expect(twoYearsAgo.getFullYear()).toBe(2022);
    });

    describe('getSyncRange', () => {
        it('should trigger backfill if no latestTimestamp is provided', () => {
            const range = DateHelper.getSyncRange(null, { defaultBackfillYears: 2 });
            expect(range.isBackfill).toBe(true);
            expect(range.isUpToDate).toBe(false);
            
            const expectedFromDate = new Date();
            expectedFromDate.setFullYear(expectedFromDate.getFullYear() - 2);
            expect(range.fromDateStr).toBe(DateHelper.toSqlDate(expectedFromDate));
        });

        it('should trigger backfill if gap is larger than threshold', () => {
            // Timestamp 10 days ago
            const tenDaysAgo = new Date();
            tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
            const ts = Math.floor(tenDaysAgo.getTime() / 1000);

            const range = DateHelper.getSyncRange(ts, { gapThresholdHours: 48, offsetSeconds: 86400 });
            expect(range.isBackfill).toBe(true);
            
            // Expected fromDate is latestTimestamp + 86400s
            const expectedFromDate = new Date((ts + 86400) * 1000);
            expect(range.fromDateStr).toBe(DateHelper.toSqlDate(expectedFromDate));
        });

        it('should return isUpToDate true if date is in the future', () => {
            const today = new Date();
            const ts = Math.floor(today.getTime() / 1000);
            
            const range = DateHelper.getSyncRange(ts, { gapThresholdHours: 48, offsetSeconds: 86400 });
            expect(range.isBackfill).toBe(false);
            expect(range.isUpToDate).toBe(true);
        });
    });
});
