export class YieldCurveAction {
    /**
     * @param {Object} fredRepo 
     * @param {Object} notificationService 
     */
    constructor(fredRepo, notificationService) {
        this.fredRepo = fredRepo;
        this.notificationService = notificationService;
    }

    async handle(eventData) {
        console.log(`[YieldCurveAction] Starte Analyse für Yield Curve Update...`);
        try {
            const { date, spread } = eventData.payload;

            // 1. Hole Historie der letzten ~25 Handelstage (~5 Wochen)
            const history = await this.fredRepo.getHistoricalIndicatorValues('T10Y2Y', 25);
            
            if (history.length < 5) {
                console.log(`[YieldCurveAction] Nicht genug Historie für T10Y2Y (nur ${history.length} Einträge), überspringe Alert.`);
                return;
            }

            // Historische Werte (Array ist absteigend sortiert: 0 = heute/neuester)
            const todayValue = spread;
            const weekAgoValue = history.length > 5 ? history[5].value : history[history.length - 1].value;
            const monthAgoValue = history.length > 20 ? history[20].value : history[history.length - 1].value;

            // 2. Trend Analyse (über 1 Monat)
            let trend = '';
            let trendEmoji = '';
            const change1m = todayValue - monthAgoValue;
            
            if (change1m > 0.15) {
                trend = 'Klares Steepening (Kurve wird steiler)';
                trendEmoji = '📈';
            } else if (change1m < -0.15) {
                trend = 'Klares Flattening (Kurve flacht ab)';
                trendEmoji = '📉';
            } else {
                trend = 'Seitwärts / Unauffällig';
                trendEmoji = '➡️';
            }

            // 3. Invertierungs-Status
            let status = '';
            let statusEmoji = '';
            if (todayValue < 0) {
                status = 'Invertiert (Rezessions-Warnsignal)';
                statusEmoji = '⚠️';
            } else {
                status = 'Normal (Positiver Spread)';
                statusEmoji = '✅';
            }

            // 4. Nachricht bauen und versenden
            const message = `🚨 **Yield Curve Update (10-2 Year Spread)** 🚨\n\n` +
                `Der Spread wurde soeben für den **${date}** aktualisiert.\n\n` +
                `**Aktueller Spread:** ${todayValue.toFixed(2)}%\n` +
                `**Vor 1 Woche:** ${weekAgoValue.toFixed(2)}%\n` +
                `**Vor 1 Monat:** ${monthAgoValue.toFixed(2)}%\n\n` +
                `**Status:** ${statusEmoji} ${status}\n` +
                `**Momentum (1 Monat):** ${trendEmoji} ${trend}\n\n` +
                `*Info: Ein rasantes "Bull Steepening" bei einer invertierten Kurve ging historisch oft größeren Marktturbulenzen voraus.*`;

            await this.notificationService.sendNotification({
                title: `📈 Yield Curve Update`,
                message: message,
                priority: 3, 
                tags: ['macro', 'chart_with_downwards_trend']
            });

            console.log(`[YieldCurveAction] ✅ Alert für ${date} gesendet.`);

        } catch (error) {
            console.error(`[YieldCurveAction] ❌ Fehler bei der Verarbeitung:`, error.message);
        }
    }
}
