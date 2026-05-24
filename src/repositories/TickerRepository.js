export class TickerRepository {
    constructor(supabaseClient) {
        this.supabaseClient = supabaseClient;
    }

    async getAllTickers() {
        // Holt vorerst alle IDs und Namen aus der Tabelle 'ticker'
        const { data, error } = await this.supabaseClient
            .from('ticker')
            .select('id, name');

        if (error) {
            throw new Error(`Fehler beim Abrufen der Ticker: ${error.message}`);
        }

        return data || [];
    }
}