import Holidays from 'date-holidays';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class TradingCalendarBuilder {
    /**
     * @param {Object} supabaseClient 
     */
    constructor(supabaseClient) {
        this.db = supabaseClient;
        this.holidays = new Holidays('US');
    }

    /**
     * Erstellt oder aktualisiert den Trading-Kalender in der Datenbank
     * @param {number} startYear 
     * @param {number} endYear 
     */
    async buildCalendar(startYear = 2000, endYear = 2050) {
        console.log(`Erstelle Trading Calendar von ${startYear} bis ${endYear}...`);
        
        const exceptionsPath = path.join(__dirname, 'market_exceptions.json');
        let exceptions = {};
        if (fs.existsSync(exceptionsPath)) {
            exceptions = JSON.parse(fs.readFileSync(exceptionsPath, 'utf8'));
            console.log(`Lade ${Object.keys(exceptions).length} manuelle Sonderschließungen (Exceptions).`);
        }

        const records = [];
        
        for (let year = startYear; year <= endYear; year++) {
            let currentDate = new Date(`${year}-01-01T00:00:00Z`);
            const endOfYear = new Date(`${year}-12-31T00:00:00Z`);

            while (currentDate <= endOfYear) {
                const dateStr = currentDate.toISOString().split('T')[0];
                const dayOfWeek = currentDate.getUTCDay();
                
                // 0 = Sonntag, 6 = Samstag
                const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
                
                // Feiertage prüfen (public / bank holidays)
                const holidayList = this.holidays.isHoliday(currentDate);
                const isPublicHoliday = holidayList && holidayList.some(h => h.type === 'public' || h.type === 'bank');
                let holidayName = isPublicHoliday ? holidayList.find(h => h.type === 'public' || h.type === 'bank').name : null;

                let isTradingDay = !isWeekend && !isPublicHoliday;
                let isEarlyClose = false;

                // Exceptions überschreiben die Standard-Logik
                if (exceptions[dateStr]) {
                    const rule = exceptions[dateStr];
                    if (rule.is_trading_day !== undefined) isTradingDay = rule.is_trading_day;
                    if (rule.holiday_name !== undefined) holidayName = rule.holiday_name;
                    if (rule.early_close !== undefined) isEarlyClose = rule.early_close;
                }

                records.push({
                    date: dateStr,
                    is_trading_day: isTradingDay,
                    holiday_name: holidayName,
                    early_close: isEarlyClose
                });

                // Nächster Tag
                currentDate.setUTCDate(currentDate.getUTCDate() + 1);
            }
        }

        console.log(`Generiert: ${records.length} Tage. Schreibe in Datenbank...`);

        // Chunking, um mögliche PostgREST Limits (max rows) zu umgehen
        const chunkSize = 1000;
        let successCount = 0;

        for (let i = 0; i < records.length; i += chunkSize) {
            const chunk = records.slice(i, i + chunkSize);
            const { error } = await this.db
                .from('market_trading_days')
                .upsert(chunk, { onConflict: 'date' });

            if (error) {
                throw new Error(`Fehler beim Speichern des Chunks ab ${chunk[0].date}: ${error.message}`);
            }
            successCount += chunk.length;
        }

        console.log(`Trading Calendar erfolgreich aktualisiert: ${successCount} Tage gespeichert.`);
    }
}
