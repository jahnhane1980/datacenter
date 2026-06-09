import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SecController } from '../../src/controllers/SecController.js';
import ky from 'ky';
import YahooFinance from 'yahoo-finance2';

vi.mock('ky');
vi.mock('yahoo-finance2', () => {
    return {
        default: {
            suppressNotices: vi.fn(),
            fundamentalsTimeSeries: vi.fn()
        }
    };
});

describe('SecController', () => {
    let mockSecRepo;
    let mockSecService;
    let controller;

    beforeEach(() => {
        mockSecRepo = {
            getCompaniesWithoutCik: vi.fn(),
            updateCompanyCik: vi.fn(),
            getTrackedCompanies: vi.fn(),
            fmpFundamentalExists: vi.fn(),
            saveFmpFundamentals: vi.fn(),
            getCompanyKeywords: vi.fn(),
            filingExists: vi.fn(),
            saveRawFiling: vi.fn(),
            saveAiSignals: vi.fn()
        };
        mockSecService = {
            fetchCikMapping: vi.fn(),
            fetchLatestFilings: vi.fn(),
            fetchFilingContent: vi.fn()
        };

        controller = new SecController(mockSecRepo, mockSecService);
        process.env.GROQ_API_KEY = 'test-key';
    });
    
    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('runCikSync', () => {
        it('should do nothing if no missing CIKs', async () => {
            mockSecRepo.getCompaniesWithoutCik.mockResolvedValue([]);
            await controller.runCikSync();
            expect(mockSecService.fetchCikMapping).not.toHaveBeenCalled();
        });

        it('should update missing CIKs', async () => {
            mockSecRepo.getCompaniesWithoutCik.mockResolvedValue([{ ticker: 'AAPL' }]);
            mockSecService.fetchCikMapping.mockResolvedValue([
                { ticker: 'AAPL', cik_str: 320193, title: 'Apple Inc.' }
            ]);

            await controller.runCikSync();

            expect(mockSecRepo.updateCompanyCik).toHaveBeenCalledWith('AAPL', '0000320193');
        });
    });

    describe('_cleanHtmlText and _extractLlmContext', () => {
        it('should clean HTML tags', () => {
            const html = '<div>Hello <b>World</b><script>alert(1)</script></div>';
            expect(controller._cleanHtmlText(html)).toBe('Hello World');
        });

        it('should extract snippet context', () => {
            const text = 'This is a long text about artificial intelligence and other things.';
            const snippets = controller._extractLlmContext(text, 'artificial intelligence', 10);
            expect(snippets.length).toBe(1);
            expect(snippets[0]).toContain('artificial intelligence');
        });
    });

    describe('_analyzeSnippetWithGroq', () => {
        it('should call Groq API and return json', async () => {
            ky.post.mockReturnValue({
                json: vi.fn().mockResolvedValue({
                    choices: [{ message: { content: '{"trend": "EXPANSION", "extracted_quote": "q", "ai_reasoning": "r"}' } }]
                })
            });

            const result = await controller._analyzeSnippetWithGroq('text', 'metric', 'AAPL', 'HYPERSCALER');
            expect(result).toEqual({ trend: 'EXPANSION', extracted_quote: 'q', ai_reasoning: 'r' });
        });
    });
});
