import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QRAController } from '../../src/controllers/QRAController.js';

describe('QRAController', () => {
    let mockQraRepo;
    let mockQraService;
    let mockLlmService;
    let controller;

    beforeEach(() => {
        mockQraRepo = { upsertQraEstimate: vi.fn() };
        mockQraService = { fetchLatestFinancingEstimates: vi.fn() };
        mockLlmService = { parseQraArticle: vi.fn() };

        controller = new QRAController(mockQraRepo, mockQraService, mockLlmService);
        
        vi.useFakeTimers();
    });

    describe('runSync', () => {
        it('should skip if not a QRA month', async () => {
            // January is not a QRA month
            vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
            
            await controller.runSync();
            
            expect(mockQraService.fetchLatestFinancingEstimates).not.toHaveBeenCalled();
        });

        it('should fetch and upsert if in QRA month', async () => {
            // February is a QRA month
            vi.setSystemTime(new Date('2026-02-01T12:00:00Z'));
            
            mockQraService.fetchLatestFinancingEstimates.mockResolvedValue({
                targetQuarter: '2026-Q1',
                releaseDate: '2026-01-31',
                estimatedNetBorrowing: 500000000000,
                estimatedTgaBalance: 750000000000
            });

            await controller.runSync();
            
            expect(mockQraService.fetchLatestFinancingEstimates).toHaveBeenCalled();
            expect(mockQraRepo.upsertQraEstimate).toHaveBeenCalledWith(
                '2026-Q1', '2026-01-31', 500000000000, 750000000000
            );
        });

        it('should exit gracefully if no new estimates found', async () => {
            vi.setSystemTime(new Date('2026-02-01T12:00:00Z'));
            mockQraService.fetchLatestFinancingEstimates.mockResolvedValue(null);

            await controller.runSync();
            
            expect(mockQraRepo.upsertQraEstimate).not.toHaveBeenCalled();
        });
    });

    describe('runBackfill', () => {
        it('should fetch and parse historical articles via LLM', async () => {
            // Den fetchOrLoadHtml mocken, da wir keine echten HTTP requests machen wollen
            controller.fetchOrLoadHtml = vi.fn();
            
            // Standard-Mock für alle weiteren Seitenaufrufe (verhindert cheerio Absturz bei leeren Seiten)
            controller.fetchOrLoadHtml.mockResolvedValue('<html><body></body></html>');
            
            // Seite 1 mit einem Link
            controller.fetchOrLoadHtml.mockResolvedValueOnce('<html><body><a href="/news/press-releases/test">borrowing estimate text</a></body></html>');
            // Artikel HTML
            controller.fetchOrLoadHtml.mockResolvedValueOnce('<html><body><div class="clearfix text-formatted">The estimated borrowing is...</div></body></html>');

            mockLlmService.parseQraArticle.mockResolvedValue({
                target_quarter: '2025-Q4',
                release_date: '2025-10-31',
                estimated_net_borrowing: 1000,
                estimated_tga_balance: 2000
            });

            mockQraRepo.upsertQraEstimate.mockResolvedValue();

            // Läuft nun regulär durch alle Iterationen (mit leeren HTML Seiten) 
            await controller.runBackfill();

            expect(mockLlmService.parseQraArticle).toHaveBeenCalled();
            expect(mockQraRepo.upsertQraEstimate).toHaveBeenCalled();
        });
    });
});
