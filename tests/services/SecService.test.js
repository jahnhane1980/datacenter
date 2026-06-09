import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSecService } from '../../src/services/SecService.js';
import ky from 'ky';

vi.mock('ky');

const mockGetCompanySubmissions = vi.fn();
vi.mock('sec-edgar-toolkit', () => {
    return {
        EdgarClient: class {
            constructor() {}
            getCompanySubmissions = mockGetCompanySubmissions;
        }
    };
});

describe('SecService', () => {
    let service;

    beforeEach(() => {
        process.env.SEC_USER_AGENT = 'App/1.0 (test@example.com)';
        service = createSecService('App/1.0 (test@example.com)');
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should throw if no userAgent provided', () => {
        delete process.env.SEC_USER_AGENT;
        expect(() => createSecService(null)).toThrow(/SEC_USER_AGENT ist nicht definiert/);
        process.env.SEC_USER_AGENT = 'App/1.0 (test@example.com)';
    });

    describe('fetchCikMapping', () => {
        it('should return mapping as array', async () => {
            ky.get.mockReturnValue({
                json: vi.fn().mockResolvedValue({
                    '0': { ticker: 'AAPL', cik_str: 320193 }
                })
            });

            const result = await service.fetchCikMapping();
            expect(result).toEqual([{ ticker: 'AAPL', cik_str: 320193 }]);
        });

        it('should throw error on fetch failure', async () => {
            ky.get.mockReturnValue({
                json: vi.fn().mockRejectedValue(new Error('Network error'))
            });

            await expect(service.fetchCikMapping()).rejects.toThrow(/Fehler beim Abrufen/);
        });
    });

    describe('fetchLatestFilings', () => {
        it('should return filtered filings', async () => {
            mockGetCompanySubmissions.mockResolvedValue({
                filings: {
                    recent: {
                        form: ['10-K', '8-K'],
                        primaryDocument: ['doc1.htm', 'doc2.htm'],
                        accessionNumber: ['123', '456'],
                        filingDate: ['2026-06-01', '2026-06-02']
                    }
                }
            });

            const result = await service.fetchLatestFilings('123', false, 5);
            expect(result).toEqual([{
                accessionNumber: '123',
                formType: '10-K',
                filingDate: '2026-06-01',
                primaryDocument: 'doc1.htm'
            }]);
        });

        it('should filter out spam 6-K', async () => {
            mockGetCompanySubmissions.mockResolvedValue({
                filings: {
                    recent: {
                        form: ['6-K', '6-K'],
                        primaryDocument: ['dividend_report.htm', 'valid_report.htm'],
                        accessionNumber: ['123', '456'],
                        filingDate: ['2026-06-01', '2026-06-02']
                    }
                }
            });

            const result = await service.fetchLatestFilings('123', true, 5);
            expect(result).toEqual([{
                accessionNumber: '456',
                formType: '6-K',
                filingDate: '2026-06-02',
                primaryDocument: 'valid_report.htm'
            }]);
        });
        
        it('should return empty if no submissions', async () => {
            mockGetCompanySubmissions.mockResolvedValue(null);
            const result = await service.fetchLatestFilings('123', false, 5);
            expect(result).toEqual([]);
        });
    });

    describe('fetchFilingContent', () => {
        it('should fetch content correctly', async () => {
            ky.get.mockReturnValue({
                text: vi.fn().mockResolvedValue('CONTENT')
            });

            const result = await service.fetchFilingContent('123', '123-456', 'doc.htm');
            expect(result).toBe('CONTENT');
            expect(ky.get).toHaveBeenCalledWith(
                'https://www.sec.gov/Archives/edgar/data/123/123456/doc.htm',
                expect.any(Object)
            );
        });

        it('should handle 6-K exhibit scanning', async () => {
            ky.get.mockReturnValueOnce({
                json: vi.fn().mockResolvedValue({
                    directory: { item: [{ name: 'ex99_1.htm' }] }
                })
            }).mockReturnValueOnce({
                text: vi.fn().mockResolvedValue('EXHIBIT_CONTENT')
            });

            const result = await service.fetchFilingContent('123', '123-456', 'doc.htm', '6-K');
            expect(result).toBe('EXHIBIT_CONTENT');
            expect(ky.get).toHaveBeenCalledWith(
                'https://www.sec.gov/Archives/edgar/data/123/123456/ex99_1.htm',
                expect.any(Object)
            );
        });
    });
});
