import { supabaseClient } from '../core/SupabaseClient.js';

const DB_TABLE = 'treasury_auctions';

export function createFiscalRepository() {
    /**
     * Erstellt oder aktualisiert einen Auktions-Datensatz.
     * Nutzt den upsert-Mechanismus von Supabase auf Basis des Primary Keys 'cusip'.
     * @param {string} auctionDate - Format 'YYYY-MM-DD'
     * @param {string} issueDate - Format 'YYYY-MM-DD' (Tag des Geldflusses ins TGA)
     * @param {string} maturityDate - Format 'YYYY-MM-DD' (Tag der Rückzahlung)
     * @param {string} securityType - 'Bill', 'Note', 'Bond' etc.
     * @param {string} securityTerm - '4-Week', '10-Year' etc.
     * @param {string} cusip - Eindeutige Wertpapierkennung
     * @param {number|null} bidToCoverRatio - Nachfrage-Indikator
     * @param {number|null} highYield - Höchste Rendite
     * @param {number|null} offeringAmount - Ursprünglich geplantes Auktionsvolumen
     * @param {number|null} totalTendered - Gebotsvolumen (Gesamt)
     * @param {number|null} totalAccepted - Zuteilungsvolumen (Gesamt)
     * @param {number|null} primaryDealerAccepted - Von Banken (Market Makern) aufgesaugtes Volumen
     * @param {number|null} directBidderAccepted - Von inländischen Fonds/Investoren gekauftes Volumen
     * @param {number|null} indirectBidderAccepted - Von ausländischen Investoren/Zentralbanken gekauftes Volumen
     * @throws {Error} Wenn der Upsert fehlschlägt.
     */
    const upsertAuctionData = async (
        auctionDate, 
        issueDate,
        maturityDate,
        securityType, 
        securityTerm, 
        cusip, 
        bidToCoverRatio, 
        highYield,
        offeringAmount,
        totalTendered, 
        totalAccepted,
        primaryDealerAccepted,
        directBidderAccepted,
        indirectBidderAccepted
    ) => {
        const { error } = await supabaseClient
            .from(DB_TABLE)
            .upsert(
                { 
                    auction_date: auctionDate,
                    issue_date: issueDate,
                    maturity_date: maturityDate,
                    security_type: securityType,
                    security_term: securityTerm,
                    cusip: cusip,
                    bid_to_cover_ratio: bidToCoverRatio,
                    high_yield: highYield,
                    offering_amount: offeringAmount,
                    total_tendered: totalTendered,
                    total_accepted: totalAccepted,
                    primary_dealer_accepted: primaryDealerAccepted,
                    direct_bidder_accepted: directBidderAccepted,
                    indirect_bidder_accepted: indirectBidderAccepted
                }, 
                { onConflict: 'cusip' }
            );

        if (error) {
            throw new Error(`Fehler beim Upsert in treasury_auctions (CUSIP: ${cusip}, Date: ${auctionDate}): ${error.message}`);
        }
    };

    /**
     * Holt das jüngste Auktionsdatum aus der Tabelle, primär als Fallback/Referenz nützlich.
     * @returns {Promise<string|null>} Das Datum als String (YYYY-MM-DD) oder null.
     */
    const getLatestAuctionDate = async () => {
        const { data, error } = await supabaseClient
            .from(DB_TABLE)
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