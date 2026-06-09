import { createPacingManager } from '../managers/PacingManager.js';

export class Router {

    /**
     * @param {Object} supabaseClient - Injizierter DB-Client für leichtere Mock-Tests
     */
    constructor(supabaseClient) {
        this.db = supabaseClient;
        this.pacingManager = createPacingManager();
        this.routes = {
            'cboe:sync': this.runCboeSync.bind(this),
            'daily:sync': this.runDailySync.bind(this),
            'events:backfill': this.runEventsBackfill.bind(this),
            'events:sync': this.runEventsSync.bind(this),
            'finra:backfill': this.runFinraBackfill.bind(this),
            'finra:sync': this.runFinraSync.bind(this),
            'fiscal:backfill': this.runFiscalBackfill.bind(this),
            'fiscal:sync': this.runFiscalSync.bind(this),
            'fred:backfill': this.runFredBackfill.bind(this),
            'fred:sync': this.runFredSync.bind(this),
            'global:backfill': this.runGlobalBackfill.bind(this),
            'global:sync': this.runGlobalSync.bind(this),
            'labor-market:backfill': this.runLaborMarketBackfill.bind(this),
            'labor-market:sync': this.runLaborMarketSync.bind(this),
            'm5:sync': this.runM5Sync.bind(this),
            'options:backfill': this.runOptionsBackfill.bind(this),
            'options:historic': this.runOptionsHistoric.bind(this),
            'options:intra': this.runOptionsIntra.bind(this),
            'qra:backfill': this.runQraBackfill.bind(this),
            'qra:sync': this.runQraSync.bind(this),
            'regulation:sync': this.runRegulationSync.bind(this),
            'sec:ciks': this.runSecCiks.bind(this),
            'sec:filings': this.runSecFilings.bind(this),
            'sector-rotation:sync': this.runSectorRotationSync.bind(this),
            'sentiment-news:backfill': this.runSentimentNewsBackfill.bind(this),
            'sentiment-news:sync': this.runSentimentNewsSync.bind(this),
            'market-calendar:sync': this.runMarketCalendarSync.bind(this)
        };
    }

    /**
     * Führt eine Route aus
     */
    async execute(task, mode = 'sync') {
        const routeKey = `${task}:${mode}`;
        const action = this.routes[routeKey];
        
        if (!action) {
            throw new Error(`❌ Unbekannte Route: [${routeKey}]. Verfügbar sind: ${Object.keys(this.routes).join(', ')}`);
        }

        console.log(`\n======================================================`);
        console.log(`🚀 Starte Job: [${routeKey}]`);
        console.log(`======================================================\n`);
        
        await action();
        
        console.log(`\n======================================================`);
        console.log(`✅ Job [${routeKey}] erfolgreich beendet.`);
        console.log(`======================================================\n`);
    }

    // ==========================================
    // Dependency Injection & Ausführung pro Job
    // ==========================================

    async runCboeSync() {
        const { createTickerRepository } = await import('../repositories/TickerRepository.js');
        const { CboeRepository } = await import('../repositories/CboeRepository.js');
        const { CboeService } = await import('../services/CboeService.js');
        const { CboeController } = await import('../controllers/CboeController.js');
        const tickerRepo = createTickerRepository(this.db);
                const cboeRepo = new CboeRepository(this.db);
                const cboeService = new CboeService();
                
                const controller = new CboeController(tickerRepo, cboeRepo, cboeService, this.pacingManager);
                await controller.runSync();
        
                
    }

    async runDailySync() {
        
        // Zwingend dynamischer Import NACHDEM dotenv geladen ist
                const { createTickerRepository } = await import('../repositories/TickerRepository.js');
                const { CandleRepository } = await import('../repositories/CandleRepository.js');
                const { PolygonIoService } = await import('../services/PolygonIoService.js');
                const { MarketStatusService } = await import('../services/MarketStatusService.js');
                const { DailyController } = await import('../controllers/DailyController.js');
        
                const marketService = new MarketStatusService();
                const isMarketOpen = await marketService.isMarketOpen();
                console.log(`Polygon Market Status: ${isMarketOpen ? 'Offen' : 'Geschlossen'}`);
                
                // Abhängigkeiten (DI) bauen
                const tickerRepo = createTickerRepository(this.db);
                const candleRepo = new CandleRepository(this.db);
                const polygonService = new PolygonIoService();
        
                // Controller instanziieren
                const controller = new DailyController(tickerRepo, candleRepo, polygonService);
        
                await controller.runSync(isMarketOpen);
    }

    async runEventsBackfill() {
        const { default: ky } = await import('ky');
        const { createTickerRepository } = await import('../repositories/TickerRepository.js');
                const { EventRepository } = await import('../repositories/EventRepository.js');
                const { EventsController } = await import('../controllers/EventsController.js');
        
                const tickerRepo = createTickerRepository(this.db);
                const eventRepo = new EventRepository(this.db);
                
                const api = ky.create({
                    prefix: 'https://www.alphavantage.co',
                    timeout: 30000,
                    retry: { limit: 3, methods: ['get'] }
                });
        
                // Backfill doesn't use finnhubService, we pass null
                const controller = new EventsController(tickerRepo, eventRepo, null, api, this.pacingManager);
        
                await controller.runBackfill();
        
                
    }

    async runEventsSync() {
        
        const { createTickerRepository } = await import('../repositories/TickerRepository.js');
                const { EventRepository } = await import('../repositories/EventRepository.js');
                const { FinnhubService } = await import('../services/FinnhubService.js');
                const { EventsController } = await import('../controllers/EventsController.js');
        
                const tickerRepo = createTickerRepository(this.db);
                const eventRepo = new EventRepository(this.db);
                const finnhubService = new FinnhubService();
                // Daily Sync doesn't use ky directly, so we can pass null for httpClient
                const controller = new EventsController(tickerRepo, eventRepo, finnhubService, null, this.pacingManager);
        
                await controller.runDailySync();
        
                
    }

    async runFinraBackfill() {
        const { createTickerRepository } = await import('../repositories/TickerRepository.js');
        const { FinraRepository } = await import('../repositories/FinraRepository.js');
        const { FinraService } = await import('../services/FinraService.js');
        const { FinraController } = await import('../controllers/FinraController.js');
        const tickerRepo = createTickerRepository(this.db);
                const finraRepo = new FinraRepository(this.db);
                const finraService = new FinraService();
                
                const controller = new FinraController(tickerRepo, finraRepo, finraService, this.pacingManager);
                await controller.runBackfill();
        
                
    }

    async runFinraSync() {
        const { createTickerRepository } = await import('../repositories/TickerRepository.js');
        const { FinraRepository } = await import('../repositories/FinraRepository.js');
        const { FinraService } = await import('../services/FinraService.js');
        const { FinraController } = await import('../controllers/FinraController.js');
        // Dependencies initialisieren
                const tickerRepo = createTickerRepository(this.db);
                const finraRepo = new FinraRepository(this.db);
                const finraService = new FinraService();
        
                // Controller instanziieren und ausführen
                const controller = new FinraController(tickerRepo, finraRepo, finraService, this.pacingManager);
                await controller.runSync();
                
                
    }

    async runFiscalBackfill() {
        const { createFiscalService } = await import('../services/FiscalService.js');
        const { createFiscalRepository } = await import('../repositories/FiscalRepository.js');
        const { FiscalController } = await import('../controllers/FiscalController.js');
        const fiscalService = createFiscalService();
                const fiscalRepo = createFiscalRepository(this.db);
                
                const controller = new FiscalController(fiscalRepo, fiscalService);
                await controller.runBackfill();
        
                
    }

    async runFiscalSync() {
        const { createFiscalService } = await import('../services/FiscalService.js');
        const { createFiscalRepository } = await import('../repositories/FiscalRepository.js');
        const { FiscalController } = await import('../controllers/FiscalController.js');
        const fiscalService = createFiscalService();
                const fiscalRepo = createFiscalRepository(this.db);
                
                const controller = new FiscalController(fiscalRepo, fiscalService);
                await controller.runDailySync();
        
                
    }

    async runFredBackfill() {
        const { createFredService } = await import('../services/FredService.js');
        const { createFredRepository } = await import('../repositories/FredRepository.js');
        const { FredController } = await import('../controllers/FredController.js');
        const fredService = createFredService();
                const fredRepository = createFredRepository(this.db);
                
                const controller = new FredController(fredRepository, fredService, this.pacingManager);
        
                await controller.runBackfill();
        
                
    }

    async runFredSync() {
        const { createFredService } = await import('../services/FredService.js');
        const { createFredRepository } = await import('../repositories/FredRepository.js');
        const { FredController } = await import('../controllers/FredController.js');
        const fredService = createFredService();
                const fredRepository = createFredRepository(this.db);
                
                const controller = new FredController(fredRepository, fredService, this.pacingManager);
        
                await controller.runDailySync();
        
                
    }

    async runGlobalBackfill() {
        const { createGlobalMacroService } = await import('../services/GlobalMacroService.js');
        const { createGlobalMacroRepository } = await import('../repositories/GlobalMacroRepository.js');
        const { GlobalMacroController } = await import('../controllers/GlobalMacroController.js');
        const globalService = createGlobalMacroService();
                const globalRepo = createGlobalMacroRepository(this.db);
                
                const controller = new GlobalMacroController(globalRepo, globalService);
                await controller.runBackfill();
        
                
    }

    async runGlobalSync() {
        const { createGlobalMacroService } = await import('../services/GlobalMacroService.js');
        const { createGlobalMacroRepository } = await import('../repositories/GlobalMacroRepository.js');
        const { GlobalMacroController } = await import('../controllers/GlobalMacroController.js');
        const globalService = createGlobalMacroService();
                const globalRepo = createGlobalMacroRepository(this.db);
                
                const controller = new GlobalMacroController(globalRepo, globalService);
                await controller.runDailySync();
        
                
    }

    async runLaborMarketBackfill() {
        const { createLaborMarketService } = await import('../services/LaborMarketService.js');
        const { createLaborMarketRepository } = await import('../repositories/LaborMarketRepository.js');
        const { LaborMarketController } = await import('../controllers/LaborMarketController.js');
        const service = createLaborMarketService();
                const repo = createLaborMarketRepository(this.db);
                
                const controller = new LaborMarketController(repo, service);
                await controller.runBackfill();
        
                
    }

    async runLaborMarketSync() {
        const { createLaborMarketService } = await import('../services/LaborMarketService.js');
        const { createLaborMarketRepository } = await import('../repositories/LaborMarketRepository.js');
        const { LaborMarketController } = await import('../controllers/LaborMarketController.js');
        const service = createLaborMarketService();
                const repo = createLaborMarketRepository(this.db);
                
                const controller = new LaborMarketController(repo, service);
                await controller.runDailySync();
        
                
    }

    async runM5Sync() {
        
        // Zwingend dynamischer Import NACHDEM dotenv geladen ist
                // FIX: Importiere die Factory-Funktion statt der Klasse
                const { createTickerRepository } = await import('../repositories/TickerRepository.js');
                const { CandleRepository } = await import('../repositories/CandleRepository.js');
                const { PolygonIoService } = await import('../services/PolygonIoService.js');
                const { MarketStatusService } = await import('../services/MarketStatusService.js');
                const { M5Controller } = await import('../controllers/M5Controller.js');
        
                const marketService = new MarketStatusService();
                const isMarketOpen = await marketService.isMarketOpen();
                console.log(`Polygon Market Status: ${isMarketOpen ? 'Offen' : 'Geschlossen'}`);
                
                // Abhängigkeiten (DI) bauen
                const tickerRepo = createTickerRepository(this.db);
                const candleRepo = new CandleRepository(this.db);
                const polygonService = new PolygonIoService();
        
                // Controller instanziieren
                const controller = new M5Controller(tickerRepo, candleRepo, polygonService);
        
                await controller.runSync(isMarketOpen);
    }

    async runOptionsBackfill() {
        const { PolygonIoService } = await import('../services/PolygonIoService.js');
        const { OptionRepository } = await import('../repositories/OptionRepository.js');
        const { createTickerRepository } = await import('../repositories/TickerRepository.js');
        const { OptionsController } = await import('../controllers/OptionsController.js');
        const polygonService = new PolygonIoService();
                const optionRepo = new OptionRepository(this.db);
                const tickerRepo = createTickerRepository(this.db);
                
                // AlphaVantageService wird im backfill nicht gebraucht
                const controller = new OptionsController(tickerRepo, optionRepo, null);
        
                await controller.runBackfillSync(polygonService);
        
                
    }

    async runOptionsHistoric() {
        const { PolygonIoService } = await import('../services/PolygonIoService.js');
        const { OptionRepository } = await import('../repositories/OptionRepository.js');
        const { createTickerRepository } = await import('../repositories/TickerRepository.js');
        const { OptionsController } = await import('../controllers/OptionsController.js');
        const polygonService = new PolygonIoService();
                const optionRepo = new OptionRepository(this.db);
                const tickerRepo = createTickerRepository(this.db);
                
                // AlphaVantageService wird im historic nicht gebraucht, wir können null übergeben
                const controller = new OptionsController(tickerRepo, optionRepo, null);
        
                await controller.runHistoricSync(polygonService);
        
                
    }

    async runOptionsIntra() {
        const { AlphaVantageOptionService } = await import('../services/AlphaVantageOptionService.js');
        const { OptionsController } = await import('../controllers/OptionsController.js');
        const { createTickerRepository } = await import('../repositories/TickerRepository.js');
                const { OptionRepository } = await import('../repositories/OptionRepository.js');
        
                // Dependencies initialisieren
                const tickerRepo = createTickerRepository(this.db);
                const optionRepo = new OptionRepository(this.db);
                const alphaVantageService = new AlphaVantageOptionService();
        
                // Controller instanziieren und ausführen
                const controller = new OptionsController(tickerRepo, optionRepo, alphaVantageService);
                await controller.runIntraSync();
    }

    async runQraBackfill() {
        const { createQRARepository } = await import('../repositories/QRARepository.js');
        const { createLLMService } = await import('../services/LLMService.js');
        const { QRAController } = await import('../controllers/QRAController.js');
        // Dependencies initialisieren
                const qraRepository = createQRARepository(this.db);
                const llmService = createLLMService();
                
                // QRAService wird im Backfill nicht benötigt, hier parst das LLM
                const controller = new QRAController(qraRepository, null, llmService, this.pacingManager);
                await controller.runBackfill();
        
                
    }

    async runQraSync() {
        const { createQRAService } = await import('../services/QRAService.js');
        const { createQRARepository } = await import('../repositories/QRARepository.js');
        const { QRAController } = await import('../controllers/QRAController.js');
        // Dependencies initialisieren
                const qraService = createQRAService();
                const qraRepository = createQRARepository(this.db);
                
                // LLMService wird hier im Daily Sync nicht benötigt
                const controller = new QRAController(qraRepository, qraService, null, this.pacingManager);
                await controller.runSync();
                
                
    }

    async runRegulationSync() {
        const { createRegulationService } = await import('../services/RegulationService.js');
        const { createRegulationRepository } = await import('../repositories/RegulationRepository.js');
        const { createLLMService } = await import('../services/LLMService.js');
        const { RegulationController } = await import('../controllers/RegulationController.js');
        
        const regulationService = createRegulationService();
        const regulationRepository = createRegulationRepository(this.db);
        const llmService = createLLMService();
                
        const controller = new RegulationController(regulationRepository, regulationService, llmService);
                
        const TEST_MODE = false;
        await controller.runRegulationCheck(TEST_MODE);
    }

    async runSecCiks() {
        const { createSecService } = await import('../services/SecService.js');
        const { createSecRepository } = await import('../repositories/SecRepository.js');
        const { createLLMService } = await import('../services/LLMService.js');
        const { SecController } = await import('../controllers/SecController.js');
        
        const secService = createSecService();
        const secRepository = createSecRepository(this.db);
        const llmService = createLLMService();
        const controller = new SecController(secRepository, secService, llmService, this.pacingManager);
        
        await controller.runCikSync();
    }

    async runSecFilings() {
        const { createSecService } = await import('../services/SecService.js');
        const { createSecRepository } = await import('../repositories/SecRepository.js');
        const { createLLMService } = await import('../services/LLMService.js');
        const { SecController } = await import('../controllers/SecController.js');
        
        const secService = createSecService();
        const secRepository = createSecRepository(this.db);
        const llmService = createLLMService();
        const controller = new SecController(secRepository, secService, llmService, this.pacingManager);
        
        await controller.runMasterSync();
    }

    async runSectorRotationSync() {
        const { SectorRotationController } = await import('../controllers/SectorRotationController.js');
        const { createTickerRepository } = await import('../repositories/TickerRepository.js');
        const { CandleRepository } = await import('../repositories/CandleRepository.js');
        const { SectorRotationRepository } = await import('../repositories/SectorRotationRepository.js');
        
                // Repositories initialisieren
                const tickerRepo = createTickerRepository(this.db);
                const candleRepo = new CandleRepository(this.db);
                const sectorRepo = new SectorRotationRepository(this.db);
        
                const controller = new SectorRotationController(tickerRepo, candleRepo, sectorRepo);
        
                await controller.runDailySync();
        
                
    }

    async runSentimentNewsBackfill() {
        const { createSentimentNewsService } = await import('../services/SentimentNewsService.js');
        const { createSentimentNewsRepository } = await import('../repositories/SentimentNewsRepository.js');
        const { createTickerRepository } = await import('../repositories/TickerRepository.js');
        const { SentimentNewsController } = await import('../controllers/SentimentNewsController.js');
        const sentimentNewsService = createSentimentNewsService();
                const sentimentNewsRepository = createSentimentNewsRepository(this.db);
                const tickerRepository = createTickerRepository(this.db);
        
                const controller = new SentimentNewsController(tickerRepository, sentimentNewsRepository, sentimentNewsService, this.pacingManager);
                await controller.runBackfill();
        
                
    }

    async runSentimentNewsSync() {
        const { createSentimentNewsService } = await import('../services/SentimentNewsService.js');
        const { createSentimentNewsRepository } = await import('../repositories/SentimentNewsRepository.js');
        const { createTickerRepository } = await import('../repositories/TickerRepository.js');
        const { SentimentNewsController } = await import('../controllers/SentimentNewsController.js');
        const sentimentNewsService = createSentimentNewsService();
                const sentimentNewsRepository = createSentimentNewsRepository(this.db);
                const tickerRepository = createTickerRepository(this.db);
        
                const controller = new SentimentNewsController(tickerRepository, sentimentNewsRepository, sentimentNewsService, this.pacingManager);
                await controller.runDailySync();
        
                
    }

    async runMarketCalendarSync() {
        const { TradingCalendarBuilder } = await import('./calendar/TradingCalendarBuilder.js');
        const builder = new TradingCalendarBuilder(this.db);
        await builder.buildCalendar(2000, 2050);
    }
}
