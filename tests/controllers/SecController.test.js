import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SecController } from '../../src/controllers/SecController.js';
import YahooFinance from 'yahoo-finance2';
import fs from 'fs';

vi.mock('ky');
vi.mock('yahoo-finance2', () => ({
    default: {
        fundamentalsTimeSeries: vi.fn()
    }
}));
vi.mock('fs', () => ({
    default: {
        existsSync: vi.fn(),
        mkdirSync: vi.fn(),
        writeFileSync: vi.fn()
    }
}));

describe('SecController', () => {
    let mockSecRepo;
    let mockSecService;
    let mockLlmService;
    let mockPacingManager;
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
        mockLlmService = {
            analyzeSecSnippet: vi.fn()
        };
        mockPacingManager = {
            humanDelay: vi.fn(),
            sleepMs: vi.fn()
        };

        controller = new SecController(mockSecRepo, mockSecService, mockLlmService, mockPacingManager);
        
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        process.env.DEBUG_SAVE_SNIPPETS = 'false';
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

        it('should handle unmatched tickers', async () => {
            mockSecRepo.getCompaniesWithoutCik.mockResolvedValue([{ ticker: 'UNKNOWN' }]);
            mockSecService.fetchCikMapping.mockResolvedValue([
                { ticker: 'AAPL', cik_str: 320193, title: 'Apple Inc.' }
            ]);

            await controller.runCikSync();
            expect(mockSecRepo.updateCompanyCik).not.toHaveBeenCalled();
        });
    });

    describe('_cleanHtmlText and _extractLlmContext', () => {
        it('should clean HTML tags', () => {
            const html = '<div>Hello <b>World</b><script>alert(1)</script></div>';
            expect(controller._cleanHtmlText(html)).toBe('Hello World');
        });

        it('should clean HTML text with spaces', () => {
            const html = 'Hello&nbsp;World';
            expect(controller._cleanHtmlText(html)).toBe('Hello World');
        });
        
        it('should handle null html', () => {
            expect(controller._cleanHtmlText(null)).toBe('');
        });

        it('should extract snippet context cleanly', () => {
            const text = 'This is a long text about artificial intelligence and other things.';
            const snippets = controller._extractLlmContext(text, 'artificial intelligence', 10);
            expect(snippets.length).toBe(1);
            expect(snippets[0]).toContain('artificial intelligence');
        });
    });

    describe('runMasterSync', () => {
        it('should do nothing if no tracked companies', async () => {
            mockSecRepo.getTrackedCompanies.mockResolvedValue([]);
            await controller.runMasterSync();
            expect(YahooFinance.fundamentalsTimeSeries).not.toHaveBeenCalled();
        });

        it('should process Yahoo Finance data successfully', async () => {
            mockSecRepo.getTrackedCompanies.mockResolvedValue([{ ticker: 'AAPL', archetype: 'Tech' }]);
            YahooFinance.fundamentalsTimeSeries.mockResolvedValue([
                { asOfDate: '2024-03-31', TotalRevenue: 1000, ResearchAndDevelopment: 100, CapitalExpenditure: -50, OperatingCashFlow: 300 }
            ]);
            mockSecRepo.fmpFundamentalExists.mockResolvedValue(false);
            mockSecRepo.getCompanyKeywords.mockResolvedValue({}); // No keywords to skip SEC

            await controller.runMasterSync();

            expect(mockSecRepo.saveFmpFundamentals).toHaveBeenCalledWith(expect.objectContaining({
                ticker: 'AAPL',
                revenue: 1000,
                r_and_d: 100,
                capex_actual: 50,
                free_cash_flow: 250 // 300 - 50 = 250
            }));
        });

        it('should skip Yahoo Finance saving if data exists', async () => {
            mockSecRepo.getTrackedCompanies.mockResolvedValue([{ ticker: 'AAPL', archetype: 'Tech' }]);
            YahooFinance.fundamentalsTimeSeries.mockResolvedValue([{ date: '2024-03-31', TotalRevenue: 1000 }]);
            mockSecRepo.fmpFundamentalExists.mockResolvedValue(true);
            mockSecRepo.getCompanyKeywords.mockResolvedValue({});

            await controller.runMasterSync();
            expect(mockSecRepo.saveFmpFundamentals).not.toHaveBeenCalled();
        });

        it('should gracefully handle Yahoo Finance error', async () => {
            mockSecRepo.getTrackedCompanies.mockResolvedValue([{ ticker: 'AAPL', archetype: 'Tech' }]);
            YahooFinance.fundamentalsTimeSeries.mockRejectedValue(new Error('Yahoo Error'));
            mockSecRepo.getCompanyKeywords.mockResolvedValue({});

            await controller.runMasterSync();
            expect(mockSecRepo.getCompanyKeywords).toHaveBeenCalled(); // Should continue
        });

        it('should process SEC filings and save AI signals', async () => {
            process.env.DEBUG_SAVE_SNIPPETS = 'true';
            fs.existsSync.mockReturnValue(false); // trigger mkdir

            mockSecRepo.getTrackedCompanies.mockResolvedValue([{ ticker: 'AAPL', archetype: 'Tech', is_foreign_issuer: false }]);
            YahooFinance.fundamentalsTimeSeries.mockResolvedValue([]);
            
            mockSecRepo.getCompanyKeywords.mockResolvedValue({
                'AI Investment': ['artificial intelligence']
            });

            mockSecService.fetchLatestFilings.mockResolvedValue([
                { accessionNumber: '123', filingDate: '2024-01-01', primaryDocument: 'doc.htm', formType: '10-Q' }
            ]);
            mockSecRepo.filingExists.mockResolvedValue(false);
            mockSecService.fetchFilingContent.mockResolvedValue('We are investing heavily in artificial intelligence this year.');
            mockSecRepo.saveRawFiling.mockResolvedValue(99);

            mockLlmService.analyzeSecSnippet.mockResolvedValue({
                trend: 'Positive', extracted_quote: 'investing heavily', ai_reasoning: 'Clear statement'
            });

            await controller.runMasterSync();

            expect(mockSecService.fetchLatestFilings).toHaveBeenCalled();
            expect(mockSecService.fetchFilingContent).toHaveBeenCalled();
            expect(mockSecRepo.saveRawFiling).toHaveBeenCalled();
            expect(mockLlmService.analyzeSecSnippet).toHaveBeenCalled();
            expect(mockSecRepo.saveAiSignals).toHaveBeenCalledWith([{
                filing_id: 99,
                ticker: 'AAPL',
                filing_date: '2024-01-01',
                signal_category: 'AI Investment',
                trend: 'Positive',
                extracted_quote: 'investing heavily',
                ai_reasoning: 'Clear statement'
            }]);
            expect(fs.writeFileSync).toHaveBeenCalled();
        });

        it('should skip SEC filing if it already exists', async () => {
            mockSecRepo.getTrackedCompanies.mockResolvedValue([{ ticker: 'AAPL', archetype: 'Tech' }]);
            YahooFinance.fundamentalsTimeSeries.mockResolvedValue([]);
            mockSecRepo.getCompanyKeywords.mockResolvedValue({ 'AI': ['ai'] });
            mockSecService.fetchLatestFilings.mockResolvedValue([{ accessionNumber: '123' }]);
            mockSecRepo.filingExists.mockResolvedValue(true);

            await controller.runMasterSync();

            expect(mockSecService.fetchFilingContent).not.toHaveBeenCalled();
        });

        it('should skip SEC parsing if no snippets are found', async () => {
            mockSecRepo.getTrackedCompanies.mockResolvedValue([{ ticker: 'AAPL', archetype: 'Tech' }]);
            YahooFinance.fundamentalsTimeSeries.mockResolvedValue([]);
            mockSecRepo.getCompanyKeywords.mockResolvedValue({ 'AI': ['artificial intelligence'] });
            mockSecService.fetchLatestFilings.mockResolvedValue([{ accessionNumber: '123' }]);
            mockSecRepo.filingExists.mockResolvedValue(false);
            mockSecService.fetchFilingContent.mockResolvedValue('Nothing here.');

            await controller.runMasterSync();

            expect(mockLlmService.analyzeSecSnippet).not.toHaveBeenCalled();
        });

        it('should handle SEC processing errors gracefully', async () => {
            mockSecRepo.getTrackedCompanies.mockResolvedValue([{ ticker: 'AAPL', archetype: 'Tech' }]);
            YahooFinance.fundamentalsTimeSeries.mockResolvedValue([]);
            mockSecRepo.getCompanyKeywords.mockResolvedValue({ 'AI': ['ai'] });
            mockSecService.fetchLatestFilings.mockRejectedValue(new Error('SEC Down'));

            await controller.runMasterSync();
            expect(console.error).toHaveBeenCalled();
        });

        it('should handle 429 rate limit from LLM', async () => {
            mockSecRepo.getTrackedCompanies.mockResolvedValue([{ ticker: 'AAPL', archetype: 'Tech' }]);
            YahooFinance.fundamentalsTimeSeries.mockResolvedValue([]);
            mockSecRepo.getCompanyKeywords.mockResolvedValue({ 'AI': ['ai'] });
            mockSecService.fetchLatestFilings.mockResolvedValue([
                { accessionNumber: '123', filingDate: '2024-01-01', primaryDocument: 'doc.htm', formType: '10-Q' }
            ]);
            mockSecRepo.filingExists.mockResolvedValue(false);
            mockSecService.fetchFilingContent.mockResolvedValue('we do ai.');
            
            mockLlmService.analyzeSecSnippet.mockRejectedValue(new Error('429 Too Many Requests'));

            try {
                await controller.runMasterSync();
            } catch (e) {}

            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[ABBRUCH] Tageslimit erreicht'));
        });
    });
});
