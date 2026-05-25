export class SyncManager {
    constructor(tickerRepository, candleRepository, polygonIoService) {
        this.tickerRepository = tickerRepository;
        this.candleRepository = candleRepository;
        this.polygonIoService = polygonIoService;
    }

    formatDate(date) {
        return date.toISOString().split('T')[0];
    }

    async runDailySync(isMarketOpen = true) {
        console.log('=== Starte Daily Sync ===');
        
        // Für EOD-Kerzen brauchen wir Aktien (3) UND ETFs (4) für unsere Makro-Indikatoren.
        // Krypto (1) schließen wir hier aus, das macht später das Bitget-Skript.
        const allTickers = await this.tickerRepository.getAllTickers();

        // FIX: Kugelsicherer Cast zu Number, falls Supabase einen String liefert
        const tickers = allTickers ? allTickers.filter(t => 
            Number(t.ticker_typ_id) === 3 || Number(t.ticker_typ_id) === 4
        ) : [];
        
        if (!tickers || tickers.length === 0) {
            console.log('Keine relevanten Ticker (Aktien/ETFs) in der Datenbank gefunden.');
            return;
        }

        const today = new Date();
        const toDateStr = this.formatDate(today);

        for (const ticker of tickers) {
            console.log(`\nVerarbeite Daily für ${ticker.name} (Typ: ${ticker.ticker_typ_id})...`);
            
            try {
                const latestTimestamp = await this.candleRepository.getLatestTimestamp('daily_candles', ticker.id);
                
                let fromDate;
                let isBackfill = false;

                if (!latestTimestamp) {
                    isBackfill = true;
                    fromDate = new Date();
                    fromDate.setFullYear(today.getFullYear() - 2);
                } else {
                    // Prüfen ob eine Lücke von > 48 Stunden besteht (z.B. Script-Ausfall)
                    const hoursDiff = (today.getTime() - (latestTimestamp * 1000)) / (1000 * 60 * 60);
                    if (hoursDiff > 48) {
                        isBackfill = true;
                        console.log(`[${ticker.name}] Lücke von > 48h erkannt. Aktiviere Backfill-Modus.`);
                    }
                    
                    fromDate = new Date((latestTimestamp + 86400) * 1000); 
                }

                // Der intelligente Check: Wenn es nur ein Routine-Sync ist und der Markt zu hat -> Überspringen
                if (!isBackfill && !isMarketOpen) {
                    console.log(`[${ticker.name}] Routine-Sync pausiert: Markt ist geschlossen und DB ist aktuell.`);
                    continue;
                }

                if (fromDate > today) {
                    console.log(`[${ticker.name}] Ist bereits auf dem neuesten Stand.`);
                    continue;
                }

                const fromDateStr = this.formatDate(fromDate);
                console.log(`[${ticker.name}] Hole Daten von ${fromDateStr} bis ${toDateStr}...`);
                
                // Streaming-Ansatz: Chunk-Callback wird direkt beim Fetchen aufgerufen
                await this.polygonIoService.fetchHistoricalData(
                    ticker.name, 1, 'day', fromDateStr, toDateStr,
                    async (chunk) => {
                        await this.candleRepository.upsertCandles('daily_candles', ticker.id, chunk);
                    }
                );

            } catch (error) {
                console.error(`[${ticker.name}] Fehler: ${error.message}`);
            }
        }
        console.log('\n=== Daily Sync abgeschlossen ===');
    }

    async runM5Sync(isMarketOpen = true) {
        console.log('=== Starte M5 Sync ===');
        
        // M5 (Intraday) ist ein reines Aktien-Spiel. ETFs interessieren uns hier nicht.
        // Wir filtern direkt über das Repository auf Typ 3 (STOCK).
        const tickers = await this.tickerRepository.getAllTickers(3);
        
        if (!tickers || tickers.length === 0) {
            console.log('Keine Aktien (Typ 3) in der Datenbank gefunden.');
            return;
        }

        const today = new Date();
        const toDateStr = this.formatDate(today);

        for (const ticker of tickers) {
            console.log(`\nVerarbeite M5 für ${ticker.name}...`);
            try {
                const latestTimestamp = await this.candleRepository.getLatestTimestamp('m5_candles', ticker.id);
                
                let fromDate;
                let isBackfill = false;

                if (!latestTimestamp) {
                    isBackfill = true;
                    fromDate = new Date();
                    fromDate.setFullYear(today.getFullYear() - 2);
                } else {
                    const hoursDiff = (today.getTime() - (latestTimestamp * 1000)) / (1000 * 60 * 60);
                    if (hoursDiff > 48) {
                        isBackfill = true;
                        console.log(`[${ticker.name}] Lücke von > 48h erkannt. Aktiviere Backfill-Modus.`);
                    }
                    
                    fromDate = new Date((latestTimestamp + 300) * 1000); 
                }

                if (!isBackfill && !isMarketOpen) {
                    console.log(`[${ticker.name}] Routine-Sync pausiert: Markt ist geschlossen und DB ist aktuell.`);
                    continue;
                }

                if (fromDate > today) {
                    console.log(`[${ticker.name}] Ist bereits auf dem neuesten Stand.`);
                    continue;
                }

                const fromDateStr = this.formatDate(fromDate);
                console.log(`[${ticker.name}] Hole Daten ab ${fromDateStr}...`);

                // Streaming-Ansatz: Chunk-Callback wird direkt beim Fetchen aufgerufen
                await this.polygonIoService.fetchHistoricalData(
                    ticker.name, 5, 'minute', fromDateStr, toDateStr,
                    async (chunk) => {
                        await this.candleRepository.upsertCandles('m5_candles', ticker.id, chunk);
                    }
                );

            } catch (error) {
                console.error(`[${ticker.name}] Fehler: ${error.message}`);
            }
        }
        console.log('\n=== M5 Sync abgeschlossen ===');
    }
}