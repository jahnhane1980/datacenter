import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLLMService } from '../../src/services/LLMService.js';
import ky from 'ky';

vi.mock('ky');

describe('LLMService', () => {
    let service;

    beforeEach(() => {
        process.env.GROQ_API_KEY = 'TEST_KEY';
        service = createLLMService();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
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
            error429.response = { status: 429 };

            const expectedResponse = { target_quarter: '2026-Q3' };

            ky.post.mockReturnValueOnce({
                json: vi.fn().mockRejectedValue(error429)
            }).mockReturnValueOnce({
                json: vi.fn().mockResolvedValue({
                    choices: [{ message: { content: JSON.stringify(expectedResponse) } }]
                })
            });

            const resultPromise = service.parseQraArticle('Article text', 'url');
            
            // Fast forward sleep
            await vi.runAllTimersAsync();
            
            const result = await resultPromise;
            expect(result).toEqual(expectedResponse);
            expect(ky.post).toHaveBeenCalledTimes(2);
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
});
