import { NotificationService } from '../services/NotificationService.js';
import { LLMService } from '../services/LLMService.js';
import { createPacingManager } from '../managers/PacingManager.js';

export class GenericMacroAction {
    constructor() {
        this.notificationService = new NotificationService();
        this.llmService = new LLMService(createPacingManager());
    }

    async handle(event) {
        console.log(`   Generiere KI-Zusammenfassung via Groq (GenericMacroAction)...`);
        const aiAnalysis = await this.llmService.analyzeMacroEvent(event);
        
        const messageBody = aiAnalysis || `[KI-Analyse fehlgeschlagen]\n\nRohdaten:\n${JSON.stringify(event.details, null, 2)}`;
        const subject = `FinanceOS: ${event.type}`;

        await this.notificationService.send(subject, messageBody);
    }
}
