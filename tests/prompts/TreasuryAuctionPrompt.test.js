import { describe, it, expect } from 'vitest';
import { buildTreasuryAuctionPrompt } from '../../src/prompts/TreasuryAuctionPrompt.js';

describe('TreasuryAuctionPrompt', () => {
    it('should build prompt correctly with given data', () => {
        const auctionData = {
            security_term: '10-Year',
            auction_date: '2026-06-11',
            bid_to_cover_ratio: 2.5,
            high_yield: 4.1,
            primary_pct: 15.5,
            direct_pct: 20.0,
            indirect_pct: 64.5
        };

        const historyStats = {
            avgBtc: 2.4,
            avgYield: 4.0,
            avgPrimary: 18.0,
            avgDirect: 18.0,
            avgIndirect: 64.0
        };

        const result = buildTreasuryAuctionPrompt(auctionData, historyStats);

        expect(result.systemPrompt).toContain('Du bist ein erfahrener Fixed Income Experte');
        expect(result.userPrompt).toContain('10-Year');
        expect(result.userPrompt).toContain('2026-06-11');
        expect(result.userPrompt).toContain('2.5');
        expect(result.userPrompt).toContain('2.40'); // avgBtc.toFixed(2)
    });
});
