import { NotificationService } from '../services/NotificationService.js';
import { LLMService } from '../services/LLMService.js';
import { createPacingManager } from '../managers/PacingManager.js';

export class NetLiquidityAction {
    constructor() {
        this.notificationService = new NotificationService();
        this.llmService = new LLMService(createPacingManager());
    }

    async handle(event) {
        console.log(`   Verarbeite NetLiquidityAction...`);
        
        const { tga, rrp, fed, sofr, date } = event.details;
        
        let netLiquidity = null;
        if (fed !== null && tga !== null && rrp !== null) {
            // Net Liquidity = Fed Balance - TGA - RRP
            // Annahme: Werte sind in Millionen oder Milliarden, wir rechnen einfach mit den Rohwerten.
            netLiquidity = fed - tga - rrp;
            event.details.net_liquidity = netLiquidity;
        }

        // Spezifischer Prompt für Liquidität
        const systemPrompt = `Du bist ein hochqualifizierter quantitativer Makro-Analyst.
Deine Aufgabe ist es, aus Liquiditäts-Daten eine extrem kurze, prägnante Push-Nachricht (2 bis 4 Sätze) für einen Investor zu schreiben.
Fokus: Net Liquidity (Fed Balance Sheet - TGA - Reverse Repo).
- Wenn Net Liquidity steigt: Rückenwind für den S&P 500 (Bullish).
- Wenn Net Liquidity sinkt: Gegenwind für den S&P 500 (Bearish).
- Beziehe die aktuellen Zahlen (TGA, RRP) kurz mit ein.
- Nutze kein Markdown, schreibe fließend.
- Nutze 1-2 passende Emojis.`;

        const userPrompt = `Analysiere bitte folgendes Liquiditäts-Update vom ${date}:\n\n${JSON.stringify(event.details, null, 2)}`;

        const aiAnalysis = await this.llmService._queryGroq(systemPrompt, userPrompt, false, 300, 10000);
        
        const messageBody = aiAnalysis || `[Net Liquidity KI-Analyse fehlgeschlagen]\n\nRohdaten:\n${JSON.stringify(event.details, null, 2)}`;
        const subject = `FinanceOS: Makro Liquidität Update`;

        await this.notificationService.send(subject, messageBody);
    }
}
