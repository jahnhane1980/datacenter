import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLLMService, LLMService } from '../../src/services/LLMService.js';
import ky from 'ky';
import { GoogleGenAI } from '@google/genai';

vi.mock('ky');

const { mockGenerateContent } = vi.hoisted(() => ({
    mockGenerateContent: vi.fn()
}));

vi.mock('@google/genai', () => {
    return {
        GoogleGenAI: function() {
            this.models = {
                generateContent: mockGenerateContent
            };
        }
    };
});

describe('LLMService', () => {
    let service;
    let mockPacingManager;

    beforeEach(() => {
        process.env.GROQ_API_KEY = 'TEST_KEY';
        process.env.GEMINI_API_KEY = 'GEMINI_TEST_KEY';
        
        mockPacingManager = {
            sleepMs: vi.fn().mockResolvedValue(true)
        };

        service = createLLMService(mockPacingManager);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should throw if no apiKey provided', () => {
        delete process.env.GROQ_API_KEY;
        expect(() => createLLMService()).toThrow(/GROQ_API_KEY fehlt/);
        process.env.GROQ_API_KEY = 'TEST_KEY';
    });

    describe('parseQraArticle', () => {
        it('should parse and return JSON correctly', async () => {
            const expectedResponse = {
                target_quarter: '2026-Q3',
                release_date: '2026-06-08',
                estimated_net_borrowing: 500000,
                estimated_tga_balance: 100000
            };

            ky.post.mockReturnValue({
                json: vi.fn().mockResolvedValue({
                    choices: [{ message: { content: JSON.stringify(expectedResponse) } }]
                })
            });

            const result = await service.parseQraArticle('Article text', 'url');
            expect(result).toEqual(expectedResponse);
            expect(ky.post).toHaveBeenCalledWith('https://api.groq.com/openai/v1/chat/completions', expect.any(Object));
        });

        it('should handle 429 rate limit with retry', async () => {
            const error429 = new Error('Rate limit');
            error429.response = { 
                status: 429,
                json: vi.fn().mockResolvedValue({ error: { message: 'Too many requests' } })
            };

            const expectedResponse = { target_quarter: '2026-Q3' };

            ky.post.mockReturnValueOnce({
                json: vi.fn().mockRejectedValue(error429)
            }).mockReturnValueOnce({
                json: vi.fn().mockResolvedValue({
                    choices: [{ message: { content: JSON.stringify(expectedResponse) } }]
                })
            });

            const resultPromise = service.parseQraArticle('Article text', 'url');
            
            const result = await resultPromise;
            expect(result).toEqual(expectedResponse);
            expect(ky.post).toHaveBeenCalledTimes(2);
            expect(mockPacingManager.sleepMs).toHaveBeenCalledWith(10000);
        });

        it('should return null on max retries', async () => {
            const error429 = new Error('Rate limit');
            error429.response = { 
                status: 429,
                json: vi.fn().mockResolvedValue({ error: { message: 'Too many requests' } })
            };

            ky.post.mockReturnValue({
                json: vi.fn().mockRejectedValue(error429)
            });

            const resultPromise = service.parseQraArticle('Article text', 'url');
            
            const result = await resultPromise;
            expect(result).toBeNull();
            expect(mockPacingManager.sleepMs).toHaveBeenCalledTimes(3);
        });

        it('should throw on per day limit', async () => {
            const error429 = new Error('Rate limit');
            error429.response = { 
                status: 429,
                json: vi.fn().mockResolvedValue({ error: { message: 'Limit exceeded per day' } })
            };

            ky.post.mockReturnValue({
                json: vi.fn().mockRejectedValue(error429)
            });

            await expect(service.parseQraArticle('Article text', 'url')).rejects.toThrow(/per day/);
        });

        it('should return null on other errors', async () => {
            const error = new Error('Other error');
            ky.post.mockReturnValue({
                json: vi.fn().mockRejectedValue(error)
            });

            const result = await service.parseQraArticle('Article text', 'url');
            expect(result).toBeNull();
        });
    });

    describe('analyzeSecSnippet', () => {
        it('should parse and return JSON correctly', async () => {
            const expectedResponse = { trend: 'EXPANSION', extracted_quote: 'We are growing.' };

            ky.post.mockReturnValue({
                json: vi.fn().mockResolvedValue({
                    choices: [{ message: { content: JSON.stringify(expectedResponse) } }]
                })
            });

            const result = await service.analyzeSecSnippet('Snippet text', 'Capex', 'AAPL', 'HYPERSCALER');
            expect(result).toEqual(expectedResponse);
        });
    });

    describe('analyzeMacroEvent', () => {
        it('should parse and return string correctly (jsonMode=false)', async () => {
            const expectedResponse = "Die US Treasury Auktion lief großartig. Gut für Aktien.";

            ky.post.mockReturnValue({
                json: vi.fn().mockResolvedValue({
                    choices: [{ message: { content: expectedResponse } }]
                })
            });

            const result = await service.analyzeMacroEvent({ type: 'test' });
            expect(result).toEqual(expectedResponse);
        });
    });

    describe('analyzeRegulationDocument', () => {
        it('should throw if no gemini key', async () => {
            delete process.env.GEMINI_API_KEY;
            const noGeminiService = new LLMService();
            await expect(noGeminiService.analyzeRegulationDocument('text', 'title')).rejects.toThrow(/GEMINI_API_KEY fehlt/);
            process.env.GEMINI_API_KEY = 'GEMINI_TEST_KEY';
        });

        it('should parse and return JSON correctly', async () => {
            const expectedResponse = { ratio_changed: true, new_ratio_percent: 5 };
            mockGenerateContent.mockResolvedValue({ text: JSON.stringify(expectedResponse) });

            const result = await service.analyzeRegulationDocument('Text', 'Title');
            expect(result).toEqual(expectedResponse);
            expect(mockGenerateContent).toHaveBeenCalled();
        });

        it('should throw on 503 error', async () => {
            const error = new Error('Service Unavailable');
            error.status = 503;
            mockGenerateContent.mockRejectedValue(error);

            await expect(service.analyzeRegulationDocument('Text', 'Title')).rejects.toThrow(/Service Unavailable/);
        });

        it('should throw on other errors', async () => {
            const error = new Error('Generic error');
            mockGenerateContent.mockRejectedValue(error);

            await expect(service.analyzeRegulationDocument('Text', 'Title')).rejects.toThrow(/Generic error/);
        });
    });
});
