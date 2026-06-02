import 'dotenv/config';
import { createSecService } from './src/services/SecService.js';
import { createSecRepository } from './src/repositories/SecRepository.js';

async function runCikSync() {
    console.log('Starte lokalen SEC CIK-Sync...');

    try {
        const secService = createSecService();
        const secRepository = createSecRepository();

        // 1. Prüfen, ob wir überhaupt etwas tun müssen
        const missingCiks = await secRepository.getCompaniesWithoutCik();
        
        if (missingCiks.length === 0) {
            console.log('Alle aktiven Firmen haben bereits eine CIK hinterlegt. Nichts zu tun.');
            return;
        }

        console.log(`${missingCiks.length} Firmen ohne CIK gefunden. Lade Mapping-Datei von der SEC...`);

        // 2. Mapping herunterladen (ca. 770 KB)
        const secMappingData = await secService.fetchCikMapping();
        console.log(`Mapping geladen. Durchsuche ${secMappingData.length} SEC-Einträge...`);

        let successCount = 0;
        let notFoundCount = 0;

        // 3. Abgleich und Datenbank-Update
        for (const company of missingCiks) {
            const tickerToFind = company.ticker.toUpperCase();
            
            // Suche den Ticker in der SEC-Datei
            const match = secMappingData.find(item => item.ticker === tickerToFind);

            if (match) {
                // CIK als String auf 10 Stellen mit führenden Nullen auffüllen
                const paddedCik = String(match.cik_str).padStart(10, '0');
                
                await secRepository.updateCompanyCik(tickerToFind, paddedCik);
                console.log(`[SUCCESS] ${tickerToFind} -> CIK: ${paddedCik} (Company: ${match.title})`);
                successCount++;
            } else {
                console.log(`[WARNING] Kein SEC-Eintrag für Ticker '${tickerToFind}' gefunden.`);
                notFoundCount++;
            }
        }

        console.log('\n--- Sync Report ---');
        console.log(`Erfolgreich aktualisiert: ${successCount}`);
        console.log(`Nicht gefunden: ${notFoundCount}`);
        console.log('Sync beendet!');

    } catch (error) {
        console.error('Kritischer Fehler im CIK-Sync-Skript:', error);
        process.exit(1);
    }
}

runCikSync();