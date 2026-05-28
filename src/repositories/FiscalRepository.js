import { supabaseClient } from '../core/SupabaseClient.js';

export function createFiscalRepository() {
    /**
     * Erstellt oder aktualisiert einen Auktions-Datensatz.
     * Nutzt den upsert-Mechanismus von Supabase auf Basis des Composite Primary Keys 'auction_date, security_term'.
     * * @param {string} auctionDate - Format 'YYYY-MM-DD'
     * @param {string} securityType - 'Bill', 'Note', 'Bond' etc.
     * @param {string} securityTerm - '4-Week', '10-Year' etc.
     * @param {string} cusip - Eindeutige Wertpapierkennung
     * @param {number|null} bidToCoverRatio - Nachfrage-Indikator
     * @param {number|null} highYield - Höchste Rendite
     * @param {number|null} totalTendered - Gebotsvolumen
     * @param {number|null} totalAccepted - Zuteilungsvolumen
     * @throws {Error} Wenn der Upsert fehlschlägt.
     */
    const upsertAuctionData = async (
        auctionDate, 
        securityType, 
        securityTerm, 
        cusip, 
        bidToCoverRatio, 
        highYield, 
        totalTendered, 
        totalAccepted
    ) => {
        const { error } = await supabaseClient
            .from('treasury_auctions')
            .upsert(
                { 
                    auction_date: auctionDate,
                    security_type: securityType,
                    security_term: securityTerm,
                    cusip: cusip,
                    bid_to_cover_ratio: bidToCoverRatio,
                    high_yield: highYield,
                    total_tendered: totalTendered,
                    total_accepted: totalAccepted
                }, 
                { onConflict: 'auction_date, security_term' }
            );

        if (error) {
            throw new Error(`Fehler beim Upsert in treasury_auctions (Term: ${securityTerm}, Date: ${auctionDate}): ${error.message}`);
        }
    };

    /**
     * Holt das jüngste Auktionsdatum aus der Tabelle, primär als Fallback/Referenz nützlich.
     * @returns {Promise<string|null>} Das Datum als String (YYYY-MM-DD) oder null.
     */
    const getLatestAuctionDate = async () => {
        const { data, error } = await supabaseClient
            .from('treasury_auctions')
            .select('auction_date')
            .order('auction_date', { ascending: false })
            .limit(1);

        if (error) {
            throw new Error(`Fehler beim Abrufen des letzten Auktionsdatums: ${error.message}`);
        }

        return data && data.length > 0 ? data[0].auction_date : null;
    };

    return {
        upsertAuctionData,
        getLatestAuctionDate
    };
}