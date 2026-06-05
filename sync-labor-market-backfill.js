import 'dotenv/config';
import { createLaborMarketService } from './src/services/LaborMarketService.js';
import { createLaborMarketRepository } from './src/repositories/LaborMarketRepository.js';

async function runLaborMarketBackfill() {
    console.log('Starte Labor Market Backfill (Historischer Import ab 2000)...');

    try {
        const service = createLaborMarketService();
        const repo = createLaborMarketRepository();
        
        const backfillStartDate = '2000-01-01'; 
        const seriesList = await repo.getSeries();
        let totalSuccess = 0;

        for (const series of seriesList) {
            console.log(`Hole komplette Historie für ${series.id} ab ${backfillStartDate}...`);
            const observations = await service.fetchSeriesData(series.id, backfillStartDate);
            
            for (const obs of observations) {
                if (obs.value !== '.') {
                    await repo.upsertDataPoint(
                        series.id, 
                        obs.date, 
                        obs.realtime_start,
                        parseFloat(obs.value), 
                        false // Historische Daten werten wir als finale, revidierte Zahlen (false)
                    );
                    totalSuccess++;
                }
            }
        }
        console.log(`\n>>> Labor Market Backfill erfolgreich: ${totalSuccess} historische Datensätze geschrieben. <<<`);

    } catch (error) {
        console.error('Kritischer Fehler im Labor Market Backfill:', error);
        process.exit(1);
    }
}

runLaborMarketBackfill();