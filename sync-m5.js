import { supabaseClient } from './src/core/SupabaseClient.js';
import { TickerRepository } from './src/repositories/TickerRepository.js';
import { CandleRepository } from './src/repositories/CandleRepository.js';
import { PolygonIoService } from './src/services/PolygonIoService.js';
import { MarketStatusService } from './src/services/MarketStatusService.js';
import { SyncManager } from './src/managers/SyncManager.js';

async function main() {
    console.log('=== Initialisiere M5 Data Center ===');

    const marketService = new MarketStatusService();
    const isMarketOpen = await marketService.isMarketOpen();
    console.log(`Polygon Market Status: ${isMarketOpen ? 'Offen' : 'Geschlossen'}`);
    
    // Abhängigkeiten (DI) bauen
    const tickerRepo = new TickerRepository(supabaseClient);
    const candleRepo = new CandleRepository(supabaseClient);
    const polygonService = new PolygonIoService();

    // Manager zusammenbauen
    const syncManager = new SyncManager(tickerRepo, candleRepo, polygonService);

    try {
        await syncManager.runM5Sync(isMarketOpen);
    } catch (error) {
        console.error('Kritischer Fehler im M5 Sync:', error);
        process.exit(1);
    }
}

main();