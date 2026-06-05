import 'dotenv/config';
import { createLaborMarketService } from './src/services/LaborMarketService.js';
import { createLaborMarketRepository } from './src/repositories/LaborMarketRepository.js';

async function runLaborMarketSync() {
    console.log('Starte Labor Market Sync (Daily Delta)...');

    try {
        const service = createLaborMarketService();
        const repo = createLaborMarketRepository();
        
        const seriesList = await repo.getSeries();
        let totalSuccess = 0;

        for (const series of seriesList) {
            const latestDate = await repo.getLatestDate(series.id);
            const startDate = latestDate ? latestDate : '2024-01-01';
            
            console.log(`Hole Arbeitsmarktdaten für ${series.id} ab ${startDate}...`);
            const observations = await service.fetchSeriesData(series.id, startDate);
            
            for (const obs of observations) {
                if (obs.value !== '.') {
                    await repo.upsertDataPoint(
                        series.id, 
                        obs.date, 
                        obs.realtime_start, // FRED gibt uns hier das exakte Release-Datum
                        parseFloat(obs.value), 
                        true // Im Delta-Sync gehen wir von vorläufigen Daten aus
                    );
                    totalSuccess++;
                }
            }
        }
        console.log(`\n>>> Labor Market Sync abgeschlossen: ${totalSuccess} neue/aktualisierte Datensätze. <<<`);

    } catch (error) {
        console.error('Kritischer Fehler im Labor Market Sync:', error);
        process.exit(1);
    }
}

runLaborMarketSync();