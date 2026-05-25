import 'dotenv/config';

/**
 * Autonomer 2-Jahres Options-Backfill
 * Scannt die Datenbank nach den 121+ getriggerten Ausreißer-Kontrakten und füllt deren
 * 15-Minuten-Historie vollautomatisch bis zur maximalen Lebensdauer (max. 2 Jahre) auf.
 */
async function runAutoBackfill() {
    console.log('[OPTIONS-BACKFILL] Starte autonomen 2-Jahres-Backfill...');

    try {
        // 1. Zwingend dynamischer Import NACHDEM dotenv geladen ist
        const { supabaseClient } = await import('./src/core/SupabaseClient.js');
        const { PolygonIoService } = await import('./src/services/PolygonIoService.js');
        const { OptionRepository } = await import('./src/repositories/OptionRepository.js');

        // 2. Client sicher in die Klassen injizieren
        const polygonService = new PolygonIoService();
        const optionRepo = new OptionRepository(supabaseClient);

        // Berechne das Ziel-Datum (Heute minus 2 Jahre)
        const today = new Date();
        const twoYearsAgo = new Date();
        twoYearsAgo.setFullYear(today.getFullYear() - 2);
        
        const targetBackfillStr = twoYearsAgo.toISOString().split('T')[0];
        const todayStr = today.toISOString().split('T')[0];

        console.log(`[OPTIONS-BACKFILL] Maximales historisches Ziel: Rückwirkend bis ${targetBackfillStr}`);
        console.log('[OPTIONS-BACKFILL] Lade dynamische Watchlist aus der Datenbank...');

        // 3. Hole alle Kontrakte, die jemals als Ausreißer (Ratio >= 1.0) markiert wurden
        const { data: anomalies, error: queryError } = await supabaseClient
            .from('option_chain_snapshots')
            .select('ticker, contract_id')
            .gte('volume_oi_ratio', 1.0);

        if (queryError) {
            throw new Error(`Fehler beim Abfragen der Watchlist: ${queryError.message}`);
        }

        if (!anomalies || anomalies.length === 0) {
            console.log('[OPTIONS-BACKFILL] Keine Ausreißer in der Datenbank gefunden. Die Watchlist ist leer.');
            return;
        }

        // Duplikate filtern, um keinen Kontrakt doppelt abzufragen
        const uniqueTargets = [];
        const seenContracts = new Set();
        for (const item of anomalies) {
            if (!seenContracts.has(item.contract_id)) {
                seenContracts.add(item.contract_id);
                uniqueTargets.push(item);
            }
        }

        console.log(`[OPTIONS-BACKFILL] ${uniqueTargets.length} relevante Kontrakte für die historische Tiefenbohrung identifiziert.`);

        // 4. Für jeden Ziel-Kontrakt die maximale Historie laden
        for (const target of uniqueTargets) {
            const tickerId = target.ticker;
            const contractId = target.contract_id;

            console.log(`\n[OPTIONS-BACKFILL] Analysiere Historien-Tiefe für: ${contractId}`);

            // Ältesten (tiefsten) Eintrag in option_contract_bars ermitteln
            const { data: oldestBars, error: barError } = await supabaseClient
                .from('option_contract_bars')
                .select('bar_timestamp')
                .eq('contract_id', contractId)
                .order('bar_timestamp', { ascending: true })
                .limit(1);

            if (barError) {
                console.error(` -> [DB ERROR] Lookup fehlgeschlagen für ${contractId}:`, barError.message);
                continue;
            }

            let fromStr = targetBackfillStr;
            let toStr = todayStr;

            if (oldestBars && oldestBars.length > 0) {
                // Wenn schon Daten da sind, nehmen wir den Tag VOR dem ältesten Eintrag als Ende des Backfills
                const oldestDate = new Date(oldestBars[0].bar_timestamp);
                const toDateObj = new Date(oldestDate.getTime() - 24 * 60 * 60 * 1000);
                toStr = toDateObj.toISOString().split('T')[0];

                console.log(` -> Status: Teil-Historie vorhanden. Ältester Record vom: ${oldestBars[0].bar_timestamp.split('T')[0]}`);

                // Wenn wir schon 2 Jahre haben, überspringen wir diesen Kontrakt
                if (toStr < targetBackfillStr) {
                    console.log(` -> Ziel erreicht: Kontrakt hat bereits die vollen 2 Jahre Historie.`);
                    continue;
                }
            } else {
                console.log(` -> Status: Keine Bars vorhanden. Starte vollen historischen Download.`);
            }

            console.log(` -> Fordere Datenblock an: [${fromStr}] bis [${toStr}]`);

            try {
                // API-Call an Polygon absenden
                const bars = await polygonService.fetchOptionsContractBars(
                    contractId,
                    15,
                    'minute',
                    fromStr,
                    toStr
                );

                if (!bars || bars.length === 0) {
                    console.log(` -> Hinweis: Keine Handelsaktivität für diesen Kontrakt vor dem ${toStr}. (Kontrakt existierte wahrscheinlich noch nicht)`);
                    continue;
                }

                // Relationales Speichern
                await optionRepo.insertHistoricContractBars(tickerId, contractId, bars);
                console.log(` -> SUCCESS: ${bars.length} historische Bars erfolgreich in die Zeitmaschine geladen.`);

            } catch (apiError) {
                console.error(` -> [API ERROR] Abfrage fehlgeschlagen für ${contractId}:`, apiError.message);
            }
        }

        console.log('\n[OPTIONS-BACKFILL] Autonomer 2-Jahres-Backfill vollständig abgeschlossen.');

    } catch (globalError) {
        console.error('[OPTIONS-BACKFILL FATAL]', globalError.message);
        process.exit(1);
    }
}

runAutoBackfill();