export class SellingClimaxAction {
    constructor(notificationService) {
        this.notificationService = notificationService;
    }

    async handle(event) {
        if (!event || event.type !== 'selling_climax_detected') return;

        const { ticker, score, reasons } = event.payload;

        const message = `🚨 *SELLING CLIMAX ALERT: ${ticker}* 🚨\n`
            + `*Score:* ${score}/100\n\n`
            + `*Gründe:*\n`
            + reasons.map(r => `• ${r}`).join('\n')
            + `\n\n_System: Crash-Muster erkannt. Ein Reversal ist hochwahrscheinlich._`;

        await this.notificationService.send(message);
    }
}
