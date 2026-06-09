import { createPacingManager } from '../managers/PacingManager.js';
import { ControllerRegistry } from './ControllerRegistry.js';

export class Router {

    /**
     * @param {Object} supabaseClient - Injizierter DB-Client für leichtere Mock-Tests
     */
    constructor(supabaseClient) {
        this.db = supabaseClient;
        this.pacingManager = createPacingManager();
        this.factory = new ControllerRegistry(this.db, this.pacingManager);
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
        const controller = await this.factory.getController('CboeController');
        await controller.runSync();
    }

    async runDailySync() {
        const { MarketStatusService } = await import('../services/MarketStatusService.js');
        const marketService = new MarketStatusService();
        const isMarketOpen = await marketService.isMarketOpen();
        console.log(`Polygon Market Status: ${isMarketOpen ? 'Offen' : 'Geschlossen'}`);
        
        const controller = await this.factory.getController('DailyController');
        await controller.runSync(isMarketOpen);
    }

    async runEventsBackfill() {
        const controller = await this.factory.getController('EventsController');
        await controller.runBackfill();
    }

    async runEventsSync() {
        const controller = await this.factory.getController('EventsController');
        await controller.runDailySync();
    }

    async runFinraBackfill() {
        const controller = await this.factory.getController('FinraController');
        await controller.runBackfill();
    }

    async runFinraSync() {
        const controller = await this.factory.getController('FinraController');
        await controller.runSync();
    }

    async runFiscalBackfill() {
        const controller = await this.factory.getController('FiscalController');
        await controller.runBackfill();
    }

    async runFiscalSync() {
        const controller = await this.factory.getController('FiscalController');
        await controller.runDailySync();
    }

    async runFredBackfill() {
        const controller = await this.factory.getController('FredController');
        await controller.runBackfill();
    }

    async runFredSync() {
        const controller = await this.factory.getController('FredController');
        await controller.runDailySync();
    }

    async runGlobalBackfill() {
        const controller = await this.factory.getController('GlobalMacroController');
        await controller.runBackfill();
    }

    async runGlobalSync() {
        const controller = await this.factory.getController('GlobalMacroController');
        await controller.runDailySync();
    }

    async runLaborMarketBackfill() {
        const controller = await this.factory.getController('LaborMarketController');
        await controller.runBackfill();
    }

    async runLaborMarketSync() {
        const controller = await this.factory.getController('LaborMarketController');
        await controller.runDailySync();
    }

    async runM5Sync() {
        const { MarketStatusService } = await import('../services/MarketStatusService.js');
        const marketService = new MarketStatusService();
        const isMarketOpen = await marketService.isMarketOpen();
        console.log(`Polygon Market Status: ${isMarketOpen ? 'Offen' : 'Geschlossen'}`);
        
        const controller = await this.factory.getController('M5Controller');
        await controller.runSync(isMarketOpen);
    }

    async runOptionsBackfill() {
        const { PolygonIoService } = await import('../services/PolygonIoService.js');
        const polygonService = new PolygonIoService();
        const controller = await this.factory.getController('OptionsController');
        await controller.runBackfillSync(polygonService);
    }

    async runOptionsHistoric() {
        const { PolygonIoService } = await import('../services/PolygonIoService.js');
        const polygonService = new PolygonIoService();
        const controller = await this.factory.getController('OptionsController');
        await controller.runHistoricSync(polygonService);
    }

    async runOptionsIntra() {
        const controller = await this.factory.getController('OptionsController');
        await controller.runIntraSync();
    }

    async runQraBackfill() {
        const controller = await this.factory.getController('QRAController');
        await controller.runBackfill();
    }

    async runQraSync() {
        const controller = await this.factory.getController('QRAController');
        await controller.runSync();
    }

    async runRegulationSync() {
        const controller = await this.factory.getController('RegulationController');
        const TEST_MODE = false;
        await controller.runRegulationCheck(TEST_MODE);
    }

    async runSecCiks() {
        const controller = await this.factory.getController('SecController');
        await controller.runCikSync();
    }

    async runSecFilings() {
        const controller = await this.factory.getController('SecController');
        await controller.runMasterSync();
    }

    async runSectorRotationSync() {
        const controller = await this.factory.getController('SectorRotationController');
        await controller.runDailySync();
    }

    async runSentimentNewsBackfill() {
        const controller = await this.factory.getController('SentimentNewsController');
        await controller.runBackfill();
    }

    async runSentimentNewsSync() {
        const controller = await this.factory.getController('SentimentNewsController');
        await controller.runDailySync();
    }

    async runMarketCalendarSync() {
        const { TradingCalendarBuilder } = await import('./calendar/TradingCalendarBuilder.js');
        const builder = new TradingCalendarBuilder(this.db);
        await builder.buildCalendar(2000, 2050);
    }
}
