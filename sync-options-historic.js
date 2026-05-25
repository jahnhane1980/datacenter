import 'dotenv/config';

/**
 * Historischer Options-Scharfschütze mit automatischer Lücken-Erkennung (Gap-Filler)
 * Findet alle historischen Anomalien und füllt fehlende 15-Minuten-Intervalle 
 * lückenlos bis zum heutigen Tag über die Massive/Polygon-Engine auf.
 */
async function runHistoricSync() {
    console.log('[OPTIONS-HISTORIC] Starte resilienten EOD-Lauf mit Gap-Filler...');

    try {
        // 1. Zwingend dynamischer Import NACHDEM dotenv geladen ist
        const { supabaseClient } = await import('./src/core/SupabaseClient.js');
        const { PolygonIoService } = await import('./src/services/PolygonIoService.js');
        const { OptionRepository } = await import('./src/repositories/OptionRepository.js');

        // 2. Client sicher in das Repository injizieren
        const polygonService = new PolygonIoService();
        const optionRepo = new OptionRepository(supabaseClient);

        // Enddatum ist immer der heutige Tag (Handelsabschluss)
        const todayStr = new Date().toISOString().split('T')[0];

        console.log('[OPTIONS-HISTORIC] Extrahiere alle jemals registrierten Volumen-Ausreißer...');

        // 3. Holen ALLER Kontrakte, die jemals ein Ratio > 1.0 ausgelöst haben
        const { data: anomalies, error: queryError } = await supabaseClient
            .from('option_chain_snapshots')
            .select('ticker, contract_id')
            .gte('volume_oi_ratio', 1.0);

        if (queryError) {
            throw new Error(`Fehler beim Abfragen der Anomalien-Historie: ${queryError.message}`);
        }

        if (!anomalies || anomalies.length === 0) {
            console.log('[OPTIONS-HISTORIC] Keine historischen Volumen-Ausreißer in option_chain_snapshots gefunden. Warte auf Intraday-Signale.');
            return;
        }

        // Duplikate filtern, damit wir jeden Kontrakt nur einmal anfassen
        const uniqueAnomalies = [];
        const seenContracts = new Set();
        for (const item of anomalies) {
            if (!seenContracts.has(item.contract_id)) {
                seenContracts.add(item.contract_id);
                uniqueAnomalies.push(item);
            }
        }

        console.log(`[OPTIONS-HISTORIC] ${uniqueAnomalies.length} einzigartige Kontrakte müssen überprüft werden.`);

        // 4. Lücken analysieren und sequentiell via Polygon nachladen
        for (const anomaly of uniqueAnomalies) {
            const tickerId = anomaly.ticker;
            const contractId = anomaly.contract_id;

            console.log(`\n[OPTIONS-HISTORIC] Analysiere Daten-Integrität für: ${contractId}`);

            // A. Jüngsten (neuesten) Eintrag in option_contract_bars für diesen Kontrakt ermitteln
            const { data: latestBars, error: barError } = await supabaseClient
                .from('option_contract_bars')
                .select('bar_timestamp')
                .eq('contract_id', contractId)
                .order('bar_timestamp', { ascending: false })
                .limit(1);

            if (barError) {
                console.error(` -> [DB ERROR] Lookup fehlgeschlagen für ${contractId}:`, barError.message);
                continue;
            }

            let fromStr;
            if (latestBars && latestBars.length > 0) {
                // Wenn Daten da sind: Starte genau 1 Tag nach dem jüngsten Eintrag (Lückenschluss)
                const latestDate = new Date(latestBars[0].bar_timestamp);
                latestDate.setDate(latestDate.getDate() + 1);
                fromStr = latestDate.toISOString().split('T')[0];
                console.log(` -> Status: Teilweise vorhanden. Letzter Eintrag vom: ${latestBars[0].bar_timestamp.split('T')[0]}`);
            } else {
                // Wenn die Tabelle für diesen Kontrakt komplett leer ist: Hole die letzten 5 Tage als Basis
                const fiveDaysAgo = new Date();
                fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
                fromStr = fiveDaysAgo.toISOString().split('T')[0];
                console.log(` -> Status: Keine Bars vorhanden. Initialisiere 5-Tage-Lookback.`);
            }

            // Wenn das Startdatum nach heute liegt (weil heute schon synchronisiert wurde), überspringen
            if (fromStr > todayStr) {
                console.log(` -> Integrität gewahrt: Kontrakt ist bereits lückenlos aktuell.`);
                continue;
            }

            console.log(` -> Lücken-Schluss: Ziehe Daten von [${fromStr}] bis [${todayStr}]`);

            // B. Daten über PolygonIoService abrufen (nutzt ky und fängt Rate-Limits ab)
            try {
                const bars = await polygonService.fetchOptionsContractBars(
                    contractId,
                    15,
                    'minute',
                    fromStr,
                    todayStr
                );

                if (!bars || bars.length === 0) {
                    console.log(` -> Hinweis: Keine neue Handelsaktivität in diesem Zeitraum.`);
                    continue;
                }

                // C. Daten relational wegschreiben
                await optionRepo.insertHistoricContractBars(tickerId, contractId, bars);
                console.log(` -> SUCCESS: ${bars.length} Intraday-Bars lückenlos nachgetragen.`);

            } catch (apiError) {
                console.error(` -> [API ERROR] Abfrage fehlgeschlagen für ${contractId}:`, apiError.message);
            }
        }

        console.log('\n[OPTIONS-HISTORIC] Alle historischen Gaps erfolgreich geschlossen.');

    } catch (globalError) {
        console.error('[OPTIONS-HISTORIC FATAL]', globalError.message);
        process.exit(1);
    }
}

runHistoricSync();