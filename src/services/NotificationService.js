import ky from 'ky';

/**
 * Interface/Adapter für Notifications.
 * Derzeitige Implementierung: Push-Nachrichten via ntfy.sh
 * Später leicht austauschbar gegen E-Mail, Discord Webhooks etc.
 */
export class NotificationService {
    constructor() {
        // Standardmäßig auf ntfy.sh gestellt
        this.provider = process.env.NOTIFICATION_PROVIDER || 'ntfy';
        this.ntfyTopic = process.env.NTFY_TOPIC;
    }

    /**
     * Sendet eine Benachrichtigung.
     * @param {string} subject 
     * @param {string} message 
     */
    async send(subject, message) {
        if (this.provider === 'ntfy') {
            if (!this.ntfyTopic) {
                console.warn('[NotificationService] Kein NTFY_TOPIC in .env hinterlegt. Überspringe Senden.');
                return;
            }
            await this._sendNtfySh(subject, message);
        } else {
            console.warn(`[NotificationService] Unbekannter Provider: ${this.provider}`);
        }
    }

    async _sendNtfySh(subject, message) {
        try {
            await ky.post(`https://ntfy.sh/${this.ntfyTopic}`, {
                body: message,
                headers: {
                    'Title': subject,
                    'Tags': 'chart_with_upwards_trend,moneybag' // Kleine Emojis für die Optik
                }
            });
            console.log(`📱 Push-Nachricht via ntfy.sh gesendet an Topic: ${this.ntfyTopic}`);
        } catch (error) {
            console.error('[NotificationService] Fehler beim Senden via ntfy.sh:', error.message);
        }
    }
}
