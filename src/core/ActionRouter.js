export class ActionRouter {
    constructor(supabaseClient) {
        this.db = supabaseClient;
        
        // Mapping: Welches Event geht an welche Action-Klasse?
        // Momentan leiten wir alle bekannten Events an die GenericMacroAction weiter,
        // um das bisherige Verhalten exakt beizubehalten.
        this.routes = {
            'treasury_auction_filled': this.runTreasuryAuctionAction.bind(this),
            'central_bank_update': this.runGenericMacroAction.bind(this),
            'labor_market_update': this.runGenericMacroAction.bind(this),
            'qra_estimate_added': this.runQRAAction.bind(this),
            'qra_estimate_updated': this.runQRAAction.bind(this),
            'liquidity_update': this.runNetLiquidityAction.bind(this)
        };
    }

    async execute(event) {
        const action = this.routes[event.type];
        if (!action) {
            console.log(`[ActionRouter] Kein Handler für Event-Typ: ${event.type}. Ignoriere.`);
            return;
        }
        await action(event);
    }

    // --- Die Action Handler ---
    
    // Fallback: Nutzt die bisherige LLMService Logik
    async runGenericMacroAction(event) {
        const { GenericMacroAction } = await import('../actions/GenericMacroAction.js');
        const action = new GenericMacroAction();
        await action.handle(event);
    }

    async runNetLiquidityAction(event) {
        const { NetLiquidityAction } = await import('../actions/NetLiquidityAction.js');
        const action = new NetLiquidityAction();
        await action.handle(event);
    }

    async runTreasuryAuctionAction(event) {
        const { TreasuryAuctionAction } = await import('../actions/TreasuryAuctionAction.js');
        const action = new TreasuryAuctionAction(this.db);
        await action.handle(event);
    }

    async runQRAAction(event) {
        const { QRAAction } = await import('../actions/QRAAction.js');
        const { createQRARepository } = await import('../repositories/QRARepository.js');
        const { createFiscalRepository } = await import('../repositories/FiscalRepository.js');
        const { createLLMService } = await import('../services/LLMService.js');
        const { createNotificationService } = await import('../services/NotificationService.js');

        const action = new QRAAction(
            createQRARepository(this.db),
            createFiscalRepository(this.db),
            createLLMService(),
            createNotificationService()
        );
        await action.handle(event);
    }
}
