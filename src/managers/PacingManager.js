export class PacingManager {
    /**
     * Pausiert die Ausführung für eine exakte Anzahl an Millisekunden.
     * @param {number} ms Millisekunden
     */
    async sleepMs(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Pausiert die Ausführung für eine exakte Anzahl an Sekunden.
     * @param {number} seconds Sekunden
     */
    async sleepSeconds(seconds) {
        return this.sleepMs(seconds * 1000);
    }

    /**
     * Pausiert die Ausführung für eine zufällige Zeitspanne (in Sekunden)
     * innerhalb der angegebenen Grenzen, um menschliches Verhalten zu simulieren.
     * @param {number} minSeconds Minimum in Sekunden
     * @param {number} maxSeconds Maximum in Sekunden
     */
    async humanDelay(minSeconds = 5, maxSeconds = 15) {
        if (process.env.NODE_ENV === 'test') return;
        const ms = Math.floor(Math.random() * (maxSeconds - minSeconds + 1) + minSeconds) * 1000;
        return this.sleepMs(ms);
    }

    /**
     * Verzögert die Ausführung um eine zufällige Zeitspanne, um menschliches Browsing-Verhalten zu simulieren.
     * Beinhaltet eine 15%-ige Chance auf eine verlängerte "Kaffeepause".
     */
    async scrapingDelay() {
        if (process.env.NODE_ENV === 'test') return;
        const seconds = Math.floor(Math.random() * (90 - 45 + 1) + 45);
        const isCoffeeBreak = Math.random() < 0.15;
        const finalSeconds = isCoffeeBreak ? seconds + Math.floor(Math.random() * (240 - 120 + 1) + 120) : seconds;

        if (isCoffeeBreak) {
            console.log(`[Menschliche Tarnung] Hole kurz Kaffee... Extra lange Pause für ${(finalSeconds / 60).toFixed(1)} Minuten.`);
        } else {
            console.log(`[Menschliche Tarnung] Verdaddle Zeit... Warte ${finalSeconds} Sekunden.`);
        }

        return this.sleepSeconds(finalSeconds);
    }
}

export function createPacingManager() {
    return new PacingManager();
}
