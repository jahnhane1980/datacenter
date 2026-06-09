export class ControllerRegistry {
    constructor(supabaseClient, pacingManager) {
        this.db = supabaseClient;
        this.pacingManager = pacingManager;
        
        this.registry = {
            'ArchiveController': async () => {
                const { createTickerRepository } = await import('../repositories/TickerRepository.js');
                const { ArchiveRepository } = await import('../repositories/ArchiveRepository.js');
                const { ArchiveController } = await import('../controllers/ArchiveController.js');
                
                return new ArchiveController(
                    createTickerRepository(this.db),
                    new ArchiveRepository(),
                    this.db
                );
            },
            'CboeController': async () => {
                const { createTickerRepository } = await import('../repositories/TickerRepository.js');
                const { CboeRepository } = await import('../repositories/CboeRepository.js');
                const { CboeService } = await import('../services/CboeService.js');
                const { CboeController } = await import('../controllers/CboeController.js');
                
                return new CboeController(
                    createTickerRepository(this.db), 
                    new CboeRepository(this.db), 
                    new CboeService(), 
                    this.pacingManager
                );
            },
            'DailyController': async () => {
                const { createTickerRepository } = await import('../repositories/TickerRepository.js');
                const { CandleRepository } = await import('../repositories/CandleRepository.js');
                const { PolygonIoService } = await import('../services/PolygonIoService.js');
                const { DailyController } = await import('../controllers/DailyController.js');
                
                return new DailyController(
                    createTickerRepository(this.db), 
                    new CandleRepository(this.db), 
                    new PolygonIoService()
                );
            },
            'EventsController': async () => {
                const { default: ky } = await import('ky');
                const { createTickerRepository } = await import('../repositories/TickerRepository.js');
                const { EventRepository } = await import('../repositories/EventRepository.js');
                const { FinnhubService } = await import('../services/FinnhubService.js');
                const { EventsController } = await import('../controllers/EventsController.js');
                
                const api = ky.create({
                    prefix: 'https://www.alphavantage.co',
                    timeout: 30000,
                    retry: { limit: 3, methods: ['get'] }
                });
                
                return new EventsController(
                    createTickerRepository(this.db),
                    new EventRepository(this.db),
                    new FinnhubService(),
                    api,
                    this.pacingManager
                );
            },
            'FinraController': async () => {
                const { createTickerRepository } = await import('../repositories/TickerRepository.js');
                const { FinraRepository } = await import('../repositories/FinraRepository.js');
                const { FinraService } = await import('../services/FinraService.js');
                const { FinraController } = await import('../controllers/FinraController.js');
                
                return new FinraController(
                    createTickerRepository(this.db),
                    new FinraRepository(this.db),
                    new FinraService(),
                    this.pacingManager
                );
            },
            'FiscalController': async () => {
                const { createFiscalService } = await import('../services/FiscalService.js');
                const { createFiscalRepository } = await import('../repositories/FiscalRepository.js');
                const { FiscalController } = await import('../controllers/FiscalController.js');
                
                return new FiscalController(
                    createFiscalRepository(this.db),
                    createFiscalService()
                );
            },
            'FredController': async () => {
                const { createFredService } = await import('../services/FredService.js');
                const { createFredRepository } = await import('../repositories/FredRepository.js');
                const { FredController } = await import('../controllers/FredController.js');
                
                return new FredController(
                    createFredRepository(this.db),
                    createFredService(),
                    this.pacingManager
                );
            },
            'GlobalMacroController': async () => {
                const { createGlobalMacroService } = await import('../services/GlobalMacroService.js');
                const { createGlobalMacroRepository } = await import('../repositories/GlobalMacroRepository.js');
                const { GlobalMacroController } = await import('../controllers/GlobalMacroController.js');
                
                return new GlobalMacroController(
                    createGlobalMacroRepository(this.db),
                    createGlobalMacroService()
                );
            },
            'LaborMarketController': async () => {
                const { createLaborMarketService } = await import('../services/LaborMarketService.js');
                const { createLaborMarketRepository } = await import('../repositories/LaborMarketRepository.js');
                const { LaborMarketController } = await import('../controllers/LaborMarketController.js');
                
                return new LaborMarketController(
                    createLaborMarketRepository(this.db),
                    createLaborMarketService()
                );
            },
            'M5Controller': async () => {
                const { createTickerRepository } = await import('../repositories/TickerRepository.js');
                const { CandleRepository } = await import('../repositories/CandleRepository.js');
                const { PolygonIoService } = await import('../services/PolygonIoService.js');
                const { M5Controller } = await import('../controllers/M5Controller.js');
                
                return new M5Controller(
                    createTickerRepository(this.db),
                    new CandleRepository(this.db),
                    new PolygonIoService()
                );
            },
            'OptionsController': async () => {
                const { PolygonIoService } = await import('../services/PolygonIoService.js');
                const { OptionRepository } = await import('../repositories/OptionRepository.js');
                const { createTickerRepository } = await import('../repositories/TickerRepository.js');
                const { AlphaVantageOptionService } = await import('../services/AlphaVantageOptionService.js');
                const { OptionsController } = await import('../controllers/OptionsController.js');
                
                return new OptionsController(
                    createTickerRepository(this.db),
                    new OptionRepository(this.db),
                    new AlphaVantageOptionService()
                );
            },
            'QRAController': async () => {
                const { createQRAService } = await import('../services/QRAService.js');
                const { createQRARepository } = await import('../repositories/QRARepository.js');
                const { createLLMService } = await import('../services/LLMService.js');
                const { QRAController } = await import('../controllers/QRAController.js');
                
                return new QRAController(
                    createQRARepository(this.db),
                    createQRAService(),
                    createLLMService(),
                    this.pacingManager
                );
            },
            'RegulationController': async () => {
                const { createRegulationService } = await import('../services/RegulationService.js');
                const { createRegulationRepository } = await import('../repositories/RegulationRepository.js');
                const { createLLMService } = await import('../services/LLMService.js');
                const { RegulationController } = await import('../controllers/RegulationController.js');
                
                return new RegulationController(
                    createRegulationRepository(this.db),
                    createRegulationService(),
                    createLLMService()
                );
            },
            'SecController': async () => {
                const { createSecService } = await import('../services/SecService.js');
                const { createSecRepository } = await import('../repositories/SecRepository.js');
                const { createLLMService } = await import('../services/LLMService.js');
                const { SecController } = await import('../controllers/SecController.js');
                
                return new SecController(
                    createSecRepository(this.db),
                    createSecService(),
                    createLLMService(),
                    this.pacingManager
                );
            },
            'SectorRotationController': async () => {
                const { SectorRotationController } = await import('../controllers/SectorRotationController.js');
                const { createTickerRepository } = await import('../repositories/TickerRepository.js');
                const { CandleRepository } = await import('../repositories/CandleRepository.js');
                const { SectorRotationRepository } = await import('../repositories/SectorRotationRepository.js');
                
                return new SectorRotationController(
                    createTickerRepository(this.db),
                    new CandleRepository(this.db),
                    new SectorRotationRepository(this.db)
                );
            },
            'SentimentNewsController': async () => {
                const { createSentimentNewsService } = await import('../services/SentimentNewsService.js');
                const { createSentimentNewsRepository } = await import('../repositories/SentimentNewsRepository.js');
                const { createTickerRepository } = await import('../repositories/TickerRepository.js');
                const { SentimentNewsController } = await import('../controllers/SentimentNewsController.js');
                
                return new SentimentNewsController(
                    createTickerRepository(this.db),
                    createSentimentNewsRepository(this.db),
                    createSentimentNewsService(),
                    this.pacingManager
                );
            }
        };
    }

    async getController(name) {
        if (!this.registry[name]) {
            throw new Error(`Unbekannter Controller: ${name}`);
        }
        return await this.registry[name]();
    }
}
