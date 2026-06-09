import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RegulationController } from '../../src/controllers/RegulationController.js';

describe('RegulationController', () => {
    let mockRegulationRepo;
    let mockRegulationService;
    let mockAiClient;
    let controller;

    beforeEach(() => {
        mockRegulationRepo = {
            documentExists: vi.fn(),
            insertNewRatio: vi.fn(),
            insertDocument: vi.fn()
        };
        mockRegulationService = {
            fetchRecentRegulationD: vi.fn()
        };
        mockAiClient = {
            models: {
                generateContent: vi.fn()
            }
        };

        controller = new RegulationController(mockRegulationRepo, mockRegulationService, mockAiClient);
    });

    it('should exit if no documents found', async () => {
        mockRegulationService.fetchRecentRegulationD.mockResolvedValue([]);
        await controller.runRegulationCheck();
        expect(mockRegulationRepo.documentExists).not.toHaveBeenCalled();
    });

    it('should skip documents that already exist', async () => {
        mockRegulationService.fetchRecentRegulationD.mockResolvedValue([
            { document_number: '123', abstract: 'Test', title: 'Test', publication_date: '2026-06-08', pdf_url: 'url' }
        ]);
        mockRegulationRepo.documentExists.mockResolvedValue(true);

        await controller.runRegulationCheck();

        expect(mockAiClient.models.generateContent).not.toHaveBeenCalled();
        expect(mockRegulationRepo.insertDocument).not.toHaveBeenCalled();
    });

    it('should analyze new documents and not update ratio if false', async () => {
        mockRegulationService.fetchRecentRegulationD.mockResolvedValue([
            { document_number: '123', abstract: 'Test', title: 'Test', publication_date: '2026-06-08', pdf_url: 'url' }
        ]);
        mockRegulationRepo.documentExists.mockResolvedValue(false);

        mockAiClient.models.generateContent.mockResolvedValue({
            text: JSON.stringify({ ratio_changed: false, new_ratio_percent: null, reasoning: 'No change' })
        });

        await controller.runRegulationCheck();

        expect(mockRegulationRepo.insertNewRatio).not.toHaveBeenCalled();
        expect(mockRegulationRepo.insertDocument).toHaveBeenCalledWith('123', '2026-06-08', 'Test', 'url', 'Test');
    });

    it('should analyze new documents and update ratio if true', async () => {
        mockRegulationService.fetchRecentRegulationD.mockResolvedValue([
            { document_number: '123', abstract: 'Test', title: 'Test', publication_date: '2026-06-08', pdf_url: 'url' }
        ]);
        mockRegulationRepo.documentExists.mockResolvedValue(false);

        mockAiClient.models.generateContent.mockResolvedValue({
            text: JSON.stringify({ ratio_changed: true, new_ratio_percent: 10, reasoning: 'Ratio increased' })
        });

        await controller.runRegulationCheck();

        expect(mockRegulationRepo.insertNewRatio).toHaveBeenCalledWith('2026-06-08', 10, '123');
        expect(mockRegulationRepo.insertDocument).toHaveBeenCalledWith('123', '2026-06-08', 'Test', 'url', 'Test');
    });

    it('should throw error and stop if AI returns 503', async () => {
        mockRegulationService.fetchRecentRegulationD.mockResolvedValue([
            { document_number: '123', abstract: 'Test', title: 'Test', publication_date: '2026-06-08', pdf_url: 'url' }
        ]);
        mockRegulationRepo.documentExists.mockResolvedValue(false);

        mockAiClient.models.generateContent.mockRejectedValue({ status: 503, message: 'Service Unavailable' });

        await expect(controller.runRegulationCheck()).rejects.toEqual(expect.objectContaining({ status: 503 }));
    });
});
