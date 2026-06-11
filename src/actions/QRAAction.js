import { getQraMacroAlertSystemPrompt, getQraMacroAlertUserPrompt } from '../prompts/alertPrompts.js';

export class QRAAction {
    /**
     * @param {Object} qraRepository 
     * @param {Object} fiscalRepository 
     * @param {Object} llmService 
     * @param {Object} notificationService 
     */
    constructor(qraRepository, fiscalRepository, llmService, notificationService) {
        this.qraRepository = qraRepository;
        this.fiscalRepository = fiscalRepository;
        this.llmService = llmService;
        this.notificationService = notificationService;
    }

    async handle(eventData) {
        console.log(`[QRAAction] Starte Analyse für QRA Event...`);
        try {
            // 1. Offizielle Zahlen (die gerade reingekommen sind)
            const targetQuarter = eventData.targetQuarter || eventData.new_estimate?.targetQuarter;
            
            // 2. Kompletten DB Eintrag laden (inkl. Konsens)
            const currentQra = await this.qraRepository.getLatestEstimateForQuarter(targetQuarter);
            
            if (!currentQra) {
                throw new Error(`Konnte QRA für Quartal ${targetQuarter} nicht in der DB finden.`);
            }

            // 3. Vorheriges Quartal laden (für den Trend-Vergleich)
            const previousQra = await this.qraRepository.getEstimateForPreviousQuarter(targetQuarter);

            // 4. Aktuellen T-Bill Share berechnen (letzte 30 Auktionen als Indikator)
            const recentBillShare = await this.fiscalRepository.getRecentBillShare(30);

            console.log(`[QRAAction] Sammle Daten für Macro-Analyse:`);
            console.log(` -> Quarter: ${targetQuarter}`);
            console.log(` -> Official Borrowing: $${(currentQra.estimated_net_borrowing / 1e9).toFixed(0)}B`);
            console.log(` -> Consensus Median: ${currentQra.consensus_borrowing_median ? '$' + (currentQra.consensus_borrowing_median / 1e9).toFixed(0) + 'B' : 'N/A'}`);
            console.log(` -> Previous Borrowing: ${previousQra ? '$' + (previousQra.estimated_net_borrowing / 1e9).toFixed(0) + 'B' : 'N/A'}`);
            console.log(` -> Current Bill Share: ${recentBillShare.toFixed(1)}% (TBAC Target: 15-20%)`);

            // 5. LLM Analyse anfragen
            const systemPrompt = getQraMacroAlertSystemPrompt();
            const userPrompt = getQraMacroAlertUserPrompt(currentQra, previousQra, recentBillShare);

            const analysisText = await this.llmService._queryGroq(systemPrompt, userPrompt, false, 400);

            if (!analysisText) {
                throw new Error("LLM gab keine Antwort zurück.");
            }

            // 6. Benachrichtigung senden
            await this.notificationService.sendNotification({
                title: `🏛️ QRA Macro Alert: ${targetQuarter}`,
                message: analysisText,
                priority: 4, // High Priority für QRA
                tags: ['bank', 'chart_with_upwards_trend']
            });

            console.log(`[QRAAction] ✅ Analyse abgeschlossen und Alert versendet.`);

        } catch (error) {
            console.error(`[QRAAction] ❌ Fehler bei der Verarbeitung:`, error.message);
        }
    }
}
