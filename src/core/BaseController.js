export class BaseController {
    /**
     * @param {string} controllerName - Für einheitliches Logging
     * @param {Object} [pacingManager] - Optional, falls der Controller Pausen braucht
     */
    constructor(controllerName, pacingManager = null) {
        this.controllerName = controllerName;
        this.pacingManager = pacingManager;
    }

    /**
     * Einheitlicher Wrapper für Sync-Jobs (mit Start/Ende Log und globalem Catch)
     * @param {string} jobDescription 
     * @param {Function} logicCallback 
     */
    async executeJob(jobDescription, logicCallback) {
        console.log(`\n=== 🚀 Starte ${jobDescription} [${this.controllerName}] ===`);
        try {
            await logicCallback();
        } catch (error) {
            console.error(`[FATAL ERROR in ${this.controllerName}]: ${error.message}`);
            throw error; // Wichtig: Den Fehler werfen, damit übergeordnete Workflows oder Tests korrekt fehlschlagen
        } finally {
            console.log(`=== ✅ Beendet: ${jobDescription} [${this.controllerName}] ===\n`);
        }
    }

    /**
     * Sichere Schleife über Arrays jeglicher Art
     * @param {Array} items - Was auch immer iteriert werden soll (Ticker, URLs, Objekte)
     * @param {Function} getNameFn - Wie ziehen wir einen Namen für das Error-Logging aus dem Item?
     * @param {Function} processFn - Was soll mit dem Item passieren?
     */
    async processItemsSafely(items, getNameFn, processFn) {
        for (const item of items) {
            try {
                await processFn(item);
            } catch (error) {
                const itemName = getNameFn(item);
                console.error(`[${this.controllerName}] ❌ Fehler bei '${itemName}': ${error.message}`);
            }
        }
    }

    /**
     * Universal-Pacing (falls ein Manager existiert)
     * @param {number} minSeconds 
     * @param {number} maxSeconds 
     */
    async delay(minSeconds, maxSeconds) {
        if (this.pacingManager) {
            await this.pacingManager.humanDelay(minSeconds, maxSeconds);
        }
    }
}
