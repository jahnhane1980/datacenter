import 'dotenv/config';

async function main() {
    console.log('=== Initialisiere M5 Data Center ===');

    try {
        // Zwingend dynamischer Import NACHDEM dotenv geladen ist
        const { supabaseClient } = await import('./src/core/SupabaseClient.js');
        const { TickerRepository } = await import('./src/repositories/TickerRepository.js');
        const { CandleRepository } = await import('./src/repositories/CandleRepository.js');
        const { PolygonIoService } = await import('./src/services/PolygonIoService.js');
        const { MarketStatusService } = await import('./src/services/MarketStatusService.js');
        const { SyncManager } = await import('./src/managers/SyncManager.js');

        const marketService = new MarketStatusService();
        const isMarketOpen = await marketService.isMarketOpen();
        console.log(`Polygon Market Status: ${isMarketOpen ? 'Offen' : 'Geschlossen'}`);
        
        // Abhängigkeiten (DI) bauen
        const tickerRepo = new TickerRepository(supabaseClient);
        const candleRepo = new CandleRepository(supabaseClient);
        const polygonService = new PolygonIoService();

        // Manager zusammenbauen
        const syncManager = new SyncManager(tickerRepo, candleRepo, polygonService);

        await syncManager.runM5Sync(isMarketOpen);
    } catch (error) {
        console.error('Kritischer Fehler im M5 Sync:', error);
        process.exit(1);
    }
}

main();