export class DateHelper {
    /**
     * Wandelt ein JavaScript Date-Objekt in einen YYYY-MM-DD String um.
     * @param {Date} date 
     * @returns {string} Format: YYYY-MM-DD
     */
    static toSqlDate(date = new Date()) {
        return date.toISOString().split('T')[0];
    }

    /**
     * Wandelt ein Datum (oder einen YYYY-MM-DD String) in einen Unix-Timestamp (Sekunden) um.
     * @param {Date|string} date 
     * @returns {number} Unix-Timestamp in Sekunden
     */
    static toUnixTimestamp(date) {
        const d = typeof date === 'string' ? new Date(date) : date;
        return Math.floor(d.getTime() / 1000);
    }

    /**
     * Wandelt einen Unix-Timestamp (Sekunden) in ein Date-Objekt um.
     * @param {number} seconds 
     * @returns {Date}
     */
    static fromUnixTimestamp(seconds) {
        return new Date(seconds * 1000);
    }

    /**
     * Zieht eine bestimmte Anzahl von Jahren von einem Datum ab.
     * @param {number} years 
     * @param {Date} fromDate 
     * @returns {Date} Neues Date-Objekt
     */
    static getYearsAgo(years, fromDate = new Date()) {
        const newDate = new Date(fromDate);
        newDate.setFullYear(newDate.getFullYear() - years);
        return newDate;
    }

    /**
     * Berechnet den benötigten Sync-Zeitraum basierend auf dem letzten DB-Eintrag.
     * @param {number|null} latestTimestampSeconds Letzter DB-Eintrag in Sekunden
     * @param {Object} options Optionen (defaultBackfillYears = 2, gapThresholdHours = 48, offsetSeconds = 86400)
     * @returns {Object} { fromDate, fromDateStr, toDateStr, isBackfill, isUpToDate }
     */
    static getSyncRange(latestTimestampSeconds, options = {}) {
        const {
            defaultBackfillYears = 2,
            gapThresholdHours = 48,
            offsetSeconds = 86400
        } = options;

        const today = new Date();
        const toDateStr = this.toSqlDate(today);

        let fromDate;
        let isBackfill = false;

        if (!latestTimestampSeconds) {
            isBackfill = true;
            fromDate = this.getYearsAgo(defaultBackfillYears, today);
        } else {
            const latestDate = this.fromUnixTimestamp(latestTimestampSeconds);
            const hoursDiff = (today.getTime() - latestDate.getTime()) / (1000 * 60 * 60);

            if (hoursDiff > gapThresholdHours) {
                isBackfill = true;
            }

            // Offset zum letzten Timestamp hinzufügen (Standard: 1 Tag)
            fromDate = new Date(latestDate.getTime() + (offsetSeconds * 1000));
        }

        const isUpToDate = fromDate > today;
        const fromDateStr = this.toSqlDate(fromDate);

        return {
            fromDate,
            fromDateStr,
            toDateStr,
            isBackfill,
            isUpToDate
        };
    }
}
