import 'dotenv/config';
import { createQRAService } from './src/services/QRAService.js';
import { createQRARepository } from './src/repositories/QRARepository.js';

async function runQRASync() {
    console.log('Starte täglichen QRA (Forward Guidance) Sync...');

    try {
        // 1. Zeit-Check: Sind wir in einem QRA-Monat?
        const now = new Date();
        const month = now.getMonth() + 1; // getMonth() ist 0-basiert (Jan = 0)
        const qraMonths = [2, 5, 8, 11]; // Februar, Mai, August, November

        if (!qraMonths.includes(month)) {
            console.log(`[Skip] Aktueller Monat (${month}) ist kein QRA-Monat. Sync wird beendet.`);
            return;
        }

        const qraService = createQRAService();
        const qraRepository = createQRARepository();

        console.log('Prüfe Treasury-Website auf neue Financing Estimates...');
        const estimate = await qraService.fetchLatestFinancingEstimates();

        if (!estimate) {
            console.log('Keine neuen QRA-Daten gefunden. Eventuell ist der Termin noch nicht erreicht.');
            return;
        }

        console.log(`Daten für Quartal ${estimate.targetQuarter} gefunden. Führe Upsert durch...`);

        // 2. In die Datenbank schreiben (Repository löst Konflikte via Primary Key)
        await qraRepository.upsertQraEstimate(
            estimate.targetQuarter,
            estimate.releaseDate,
            estimate.estimatedNetBorrowing,
            estimate.estimatedTgaBalance
        );

        const tgaBillion = estimate.estimatedTgaBalance ? (estimate.estimatedTgaBalance / 1_000_000_000).toFixed(0) : 'N/A';
        console.log(`✅ QRA Sync erfolgreich! Target Quarter: ${estimate.targetQuarter} | TGA Ziel: $${tgaBillion} Mrd.`);

    } catch (error) {
        console.error('Kritischer Fehler im QRA Sync-Skript:', error);
        process.exit(1);
    }
}

runQRASync();