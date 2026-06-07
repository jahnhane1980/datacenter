import 'dotenv/config';

// =========================================================================
// KONFIGURATIONS-MATRIX (V-FAKTOREN)
// =========================================================================
const V_FACTORS = {
    'SOXX': 0.7, 'IGV': 0.8, 'CIBR': 0.8, 'SKYY': 0.8, // Tech
    'XPH': 1.0, 'IBB': 0.7, 'IHI': 0.9,                // Health
    'XRT': 0.8, 'ITB': 0.7,                            // Consumer
    'KBE': 0.8, 'KRE': 0.6, 'KIE': 1.0,                // Finance
    'ITA': 0.9, 'IYT': 0.8,                            // Industrials
    'XOP': 0.7, 'XES': 0.7,                            // Energy
    'XME': 0.7,                                        // Materials
    'GDXJ': 0.6, 'GLD': 1.0                            // Gold
};

// Hilfsfunktion: Berechnet den 50-Tage RSI
function calculateRSI(prices, period = 50) {
    if (prices.length < period + 1) return 50; 
    let gains = 0; let losses = 0;
    for (let i = prices.length - period; i < prices.length; i++) {
        const diff = prices[i] - prices[i - 1];
        if (diff >= 0) gains += diff;
        else losses -= diff;
    }
    let avgGain = gains / period; let avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

async function runDailySectorSync() {
    console.log('=== 🔄 STARTE DAILY SECTOR ROTATION SYNC ===');

    try {
        // Dynamischer Import nach dotenv
        const { supabaseClient } = await import('./src/core/SupabaseClient.js');
        const { createTickerRepository, SYNC_JOBS } = await import('./src/repositories/TickerRepository.js');
        const { CandleRepository } = await import('./src/repositories/CandleRepository.js');
        const { SectorRotationRepository } = await import('./src/repositories/SectorRotationRepository.js');

        // Repositories initialisieren
        const tickerRepo = createTickerRepository();
        const candleRepo = new CandleRepository(supabaseClient);
        const sectorRepo = new SectorRotationRepository(supabaseClient);

        // 1. Letztes Datum aus dem Log holen
        const lastLogDateStr = await sectorRepo.getLatestLogDate();
        let historyStartTimestamp = 0;

        if (lastLogDateStr) {
            const lastDate = new Date(lastLogDateStr);
            
            // Wir benötigen 70 Handelstage Historie für RSI50 und 60-Tage Momentum.
            // 110 Kalendertage Puffer sind sicher ausreichend, um Wochenenden/Feiertage abzufangen.
            const historyStartDate = new Date(lastDate);
            historyStartDate.setDate(historyStartDate.getDate() - 110);
            historyStartTimestamp = Math.floor(historyStartDate.getTime() / 1000);
            
            console.log(`Letzter Log-Eintrag: ${lastLogDateStr}`);
            console.log(`Lade Kerzen-Historie ab: ${historyStartDate.toISOString().split('T')[0]}`);
        } else {
            console.log('Kein existierendes Log gefunden. Breche Daily Sync ab. Bitte zuerst Backfill ausführen!');
            process.exit(1);
        }

        // 2. Relevante Ticker laden (Job-gesteuert)
        const allTickers = await tickerRepo.getTickersForJob(SYNC_JOBS.SECTOR_ROTATION);
        if (!allTickers || allTickers.length === 0) throw new Error('Keine Ticker für SECTOR_ROTATION gefunden.');
        
        const spyTicker = allTickers.find(t => t.name === 'SPY');
        if (!spyTicker) throw new Error('SPY fehlt in der geladenen SECTOR_ROTATION Konfiguration!');

        const etfsToAnalyze = allTickers.filter(t => Object.keys(V_FACTORS).includes(t.name));

        // 3. Notwendige historische Kerzen in den RAM laden
        const marketData = {};
        console.log('Lade partielle Historie für SPY und ETFs in den RAM...');
        
        for (const ticker of [spyTicker, ...etfsToAnalyze]) {
            const candles = await candleRepo.getDailyCandlesSince(ticker.id, historyStartTimestamp);
            if (candles && candles.length > 70) {
                marketData[ticker.name] = candles;
            } else if (ticker.name === 'SPY') {
                throw new Error('Nicht genügend historische Daten für SPY gefunden. Puffer zu klein?');
            }
        }

        const spyData = marketData['SPY'];
        let allInserts = [];
        let newDaysProcessed = 0;

        // 4. Diff-Berechnung mit sicherem String-Vergleich
        for (let i = 70; i < spyData.length; i++) {
            const currentSpy = spyData[i];
            const currentDateStr = new Date(currentSpy.timestamp * 1000).toISOString().split('T')[0];
            
            // Wasserfester String-Vergleich verhindert Zeitzonen- und Uhrzeit-Glitches
            if (currentDateStr <= lastLogDateStr) {
                continue;
            }

            let dailyResults = [];
            newDaysProcessed++;

            for (const etf of etfsToAnalyze) {
                const etfData = marketData[etf.name];
                if (!etfData) continue;

                const etfIndex = etfData.findIndex(c => c.timestamp >= currentSpy.timestamp);
                if (etfIndex < 70) continue; 

                const currentEtf = etfData[etfIndex];
                const historicalCloses = etfData.slice(0, etfIndex + 1).map(d => d.close);
                
                const rsi50 = calculateRSI(historicalCloses, 50);

                const idxMinus60 = etfIndex - 60;
                const idxMinus20 = etfIndex - 20;

                const etfPerf60 = (currentEtf.close - etfData[idxMinus60].close) / etfData[idxMinus60].close;
                const spyPerf60 = (currentSpy.close - spyData[i - 60].close) / spyData[i - 60].close;
                const magnitude = etfPerf60 - spyPerf60;

                const ratioNow = currentEtf.close / currentSpy.close;
                const ratio20d = etfData[idxMinus20].close / spyData[i - 20].close;
                const velocity = (ratioNow - ratio20d) / ratio20d;

                dailyResults.push({ name: etf.name, id: etf.id, rsi50, magnitude, velocity });
            }

            if (dailyResults.length === 0) continue;

            const sortedByMag = [...dailyResults].sort((a, b) => a.magnitude - b.magnitude);
            const sortedByVel = [...dailyResults].sort((a, b) => a.velocity - b.velocity);
            const totalItems = dailyResults.length;

            for (const etf of dailyResults) {
                const magRank = sortedByMag.findIndex(x => x.name === etf.name);
                const velRank = sortedByVel.findIndex(x => x.name === etf.name);
                
                const magPoints = totalItems > 1 ? (magRank / (totalItems - 1)) * 10 : 5;
                const velPoints = totalItems > 1 ? (velRank / (totalItems - 1)) * 10 : 5;

                let rsiPoints = 0;
                if (etf.rsi50 > 75) rsiPoints = 8;
                else if (etf.rsi50 >= 35) rsiPoints = ((etf.rsi50 - 35) / 40) * 10; 

                const rawScore = (0.4 * magPoints) + (0.3 * velPoints) + (0.3 * rsiPoints);
                const vFactor = V_FACTORS[etf.name] || 0.8;
                const adjustedScore = rawScore * vFactor;

                let currentPhase = 'LAGGARD';
                if (adjustedScore >= 7.5) {
                    currentPhase = etf.rsi50 > 75 ? 'DISTRIBUTION' : 'LEADERSHIP';
                } else if (adjustedScore >= 4.0 && adjustedScore < 7.5) {
                    currentPhase = etf.velocity > 0 ? 'ACCUMULATION' : 'NEUTRAL';
                }

                allInserts.push({
                    datum: currentDateStr,
                    ticker_id: etf.id,
                    ticker_name: etf.name,
                    phase: currentPhase,
                    adj_score: parseFloat(adjustedScore.toFixed(2)),
                    raw_score: parseFloat(rawScore.toFixed(2)),
                    rsi50: parseFloat(etf.rsi50.toFixed(2)),
                    velocity: parseFloat(etf.velocity.toFixed(4))
                });
            }
        }

        // 5. In die Datenbank schreiben
        if (allInserts.length > 0) {
            console.log(`Berechnung abgeschlossen. Upsert für ${newDaysProcessed} neue(n) Tag(e) (${allInserts.length} Zeilen)...`);
            await sectorRepo.upsertLogs(allInserts);
        } else {
            console.log('Keine neuen Handelstage zu berechnen. Die Sektor-Uhr ist bereits auf dem neuesten Stand.');
        }

        console.log('\n✅ Daily Sector Rotation Sync erfolgreich beendet.');

    } catch (error) {
        console.error('\nKritischer Fehler im Sector Sync:', error);
        process.exit(1);
    }
}

runDailySectorSync();