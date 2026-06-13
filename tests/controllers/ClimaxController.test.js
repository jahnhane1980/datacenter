import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClimaxController } from '../../src/controllers/ClimaxController.js';
import { EventBus } from '../../src/core/EventBus.js';

vi.mock('../../src/core/EventBus.js', () => ({
    EventBus: {
        emit: vi.fn()
    }
}));

// Mock SellingClimaxScorer
vi.mock('../../src/core/analysis/SellingClimaxScorer.js', () => ({
    SellingClimaxScorer: {
        calculateScore: vi.fn()
    }
}));
import { SellingClimaxScorer } from '../../src/core/analysis/SellingClimaxScorer.js';

describe('ClimaxController', () => {
    let mockTickerRepo;
    let mockSupabase;
    let controller;

    beforeEach(() => {
        vi.clearAllMocks();

        mockTickerRepo = {
            getAllTickers: vi.fn().mockResolvedValue([{ id: 1, name: 'AAPL' }])
        };

        mockSupabase = {
            from: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                gte: vi.fn().mockReturnThis(),
                lte: vi.fn().mockReturnThis(),
                order: vi.fn().mockResolvedValue({
                    data: [], // Default: leer
                    error: null
                })
            })
        };

        controller = new ClimaxController(mockTickerRepo, mockSupabase);
        
        // Verhindern, dass executeJob das Array parallel abarbeitet und Fehler verschluckt, 
        // oder wir mocken einfach nur das innere. Aber BaseController macht das schon gut.
    });

    it('sollte nichts tun, wenn keine Ticker vorhanden sind', async () => {
        mockTickerRepo.getAllTickers.mockResolvedValue([]);
        await controller.runScan();
        expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('sollte überspringen, wenn nicht genug Kerzen vorhanden sind', async () => {
        const fakeCandles = Array(10).fill({ volume: 100 });
        
        // Mock the sequence of DB calls: 1. Candles, 2. FINRA, 3. CBOE
        mockSupabase.from.mockImplementation((table) => {
            return {
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                gte: vi.fn().mockReturnThis(),
                lte: vi.fn().mockReturnThis(),
                order: vi.fn().mockResolvedValue({
                    data: table === 'market_daily_candles' ? fakeCandles : [],
                    error: null
                })
            }
        });

        await controller.runScan();
        // CalculateScore sollte nicht aufgerufen werden, da length < 21
        expect(SellingClimaxScorer.calculateScore).not.toHaveBeenCalled();
    });

    it('sollte ein Event auslösen, wenn der Scorer einen Climax erkennt', async () => {
        const fakeCandles = Array(25).fill({ volume: 100 });
        const fakeFinra = [{ total_volume: 100, short_volume: 50 }];
        const fakeCboe = [{ volume: 1000 }];

        mockSupabase.from.mockImplementation((table) => {
            return {
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                gte: vi.fn().mockReturnThis(),
                lte: vi.fn().mockReturnThis(),
                order: vi.fn().mockResolvedValue({
                    data: table === 'market_daily_candles' ? fakeCandles 
                        : table === 'market_finra_short_volume' ? fakeFinra
                        : fakeCboe,
                    error: null
                })
            }
        });

        SellingClimaxScorer.calculateScore.mockReturnValue({
            isClimax: true,
            score: 85,
            reasons: ['Testing']
        });

        await controller.runScan();

        expect(SellingClimaxScorer.calculateScore).toHaveBeenCalled();
        expect(EventBus.emit).toHaveBeenCalledWith(
            'ClimaxController',
            'selling_climax_detected',
            { ticker: 'AAPL', score: 85, reasons: ['Testing'] }
        );
    });

    it('sollte kein Event auslösen, wenn der Score zu niedrig ist', async () => {
        const fakeCandles = Array(25).fill({ volume: 100 });

        mockSupabase.from.mockImplementation((table) => {
            return {
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                gte: vi.fn().mockReturnThis(),
                lte: vi.fn().mockReturnThis(),
                order: vi.fn().mockResolvedValue({
                    data: table === 'market_daily_candles' ? fakeCandles : [],
                    error: null
                })
            }
        });

        SellingClimaxScorer.calculateScore.mockReturnValue({
            isClimax: false,
            score: 40,
            reasons: []
        });

        await controller.runScan();

        expect(SellingClimaxScorer.calculateScore).toHaveBeenCalled();
        expect(EventBus.emit).not.toHaveBeenCalled();
    });
});
