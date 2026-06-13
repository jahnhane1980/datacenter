import dotenv from 'dotenv';
dotenv.config();

import { supabaseClient as supabase } from './src/core/SupabaseClient.js';
import { SellingClimaxScorer } from './src/core/analysis/SellingClimaxScorer.js';

async function run() {
    console.log("Lade ausgewählte Ticker (IDs: 27, 26, 25, 12, 10, 9)...");
    const { data: tickers } = await supabase
        .from('ticker')
        .select('id, name')
        .in('id', [27, 26, 25, 12, 10, 9]);
    
    // Historie ab Nov 24 für Durchschnitte
    const histStartTs = Math.floor(new Date('2024-11-01T00:00:00Z').getTime() / 1000);
    // Fokus-Zeitraum: 15. März bis 30. April 2025
    const startTs = Math.floor(new Date('2025-03-15T00:00:00Z').getTime() / 1000);
    const endTs = Math.floor(new Date('2025-04-30T23:59:59Z').getTime() / 1000);

    console.log("Lade Daily Candles, Shorts und Options-Daten...");
    
    const resultsByDate = {};

    for (const ticker of tickers) {
        // 1. Alle Daily Candles laden
        const { data: candles } = await supabase
            .from('market_daily_candles')
            .select('timestamp, open, high, low, close, volume')
            .eq('ticker', ticker.id)
            .gte('timestamp', histStartTs)
            .lte('timestamp', endTs)
            .order('timestamp', { ascending: true });

        if (!candles || candles.length < 21) continue;

        // 2. Alle FINRA Shorts laden
        const { data: finraData } = await supabase
            .from('market_finra_short_volume')
            .select('timestamp, short_volume, total_volume')
            .eq('ticker', ticker.id)
            .gte('timestamp', histStartTs)
            .lte('timestamp', endTs)
            .order('timestamp', { ascending: true });

        // 3. Alle CBOE Options laden
        const { data: cboeData } = await supabase
            .from('option_cboe_volume')
            .select('timestamp, volume')
            .eq('ticker', ticker.id)
            .gte('timestamp', histStartTs)
            .lte('timestamp', endTs)
            .order('timestamp', { ascending: true });

        // Zeitreise Tag für Tag
        for (let i = 21; i < candles.length; i++) {
            const todayCandle = candles[i];
            
            if (todayCandle.timestamp >= startTs && todayCandle.timestamp <= endTs) {
                const candleSlice = candles.slice(0, i + 1);
                
                // End of Day ermitteln für präzises Filtern
                const dateStr = new Date(todayCandle.timestamp * 1000).toISOString().split('T')[0];
                const endOfDayTs = Math.floor(new Date(`${dateStr}T23:59:59Z`).getTime() / 1000);

                // Short-Ratios bis heute berechnen
                const pastShorts = (finraData || []).filter(d => d.timestamp <= endOfDayTs);
                const shortVolumeRatios = pastShorts.map(d => d.total_volume > 0 ? d.short_volume / d.total_volume : 0);

                // Options-Volumina bis heute filtern
                const pastOptions = (cboeData || []).filter(d => d.timestamp <= endOfDayTs);
                const optionsVolume = pastOptions.map(d => d.volume);

                // Ab in den Scorer inkl. der neuen Daten!
                const result = SellingClimaxScorer.calculateScore({
                    candles: candleSlice,
                    shortVolumeRatios: shortVolumeRatios,
                    optionsVolume: optionsVolume
                });

                if (result.score >= 10) { 
                    if (!resultsByDate[dateStr]) {
                        resultsByDate[dateStr] = [];
                    }
                    resultsByDate[dateStr].push({
                        ticker: ticker.name,
                        score: result.score,
                        isClimax: result.isClimax,
                        reasons: result.reasons
                    });
                }
            }
        }
    }

    console.log("Berechnung abgeschlossen. Gebe Ergebnisse aus...");

    const sortedDates = Object.keys(resultsByDate).sort();

    for (const dateStr of sortedDates) {
        console.log(`\n=== ${dateStr} ===`);
        const dayResults = resultsByDate[dateStr];
        dayResults.sort((a, b) => b.score - a.score);
        
        for (const res of dayResults) {
            if (res.isClimax) {
                console.log(`🚨 ${res.ticker}, score ${res.score}/100 (CLIMAX DETECTED!)`);
                res.reasons.forEach(r => console.log(`      - ${r}`));
            } else {
                console.log(`${res.ticker}, score ${res.score}/100`);
            }
        }
    }
}

run().catch(console.error);
