import { supabaseClient } from '../core/SupabaseClient.js';

export function createQRARepository() {
    /**
     * Erstellt oder aktualisiert einen QRA-Schätzwert (Quarterly Refunding Announcement).
     * Nutzt den upsert-Mechanismus von Supabase auf Basis des Composite Primary Keys 'target_quarter, release_date'.
     * @param {string} targetQuarter - Format 'YYYY-QX' (z.B. '2026-Q3')
     * @param {string} releaseDate - Format 'YYYY-MM-DD' (Tag der Ankündigung)
     * @param {number|null} estimatedNetBorrowing - Geplante Netto-Kreditaufnahme in USD
     * @param {number|null} estimatedTgaBalance - Ziel-Kontostand des TGA am Quartalsende in USD
     * @throws {Error} Wenn der Upsert fehlschlägt.
     */
    const upsertQraEstimate = async (
        targetQuarter, 
        releaseDate, 
        estimatedNetBorrowing, 
        estimatedTgaBalance
    ) => {
        const { error } = await supabaseClient
            .from('treasury_qra_estimates')
            .upsert(
                { 
                    target_quarter: targetQuarter,
                    release_date: releaseDate,
                    estimated_net_borrowing: estimatedNetBorrowing,
                    estimated_tga_balance: estimatedTgaBalance
                }, 
                { onConflict: 'target_quarter, release_date' }
            );

        if (error) {
            throw new Error(`Fehler beim Upsert in treasury_qra_estimates (Quarter: ${targetQuarter}, Release: ${releaseDate}): ${error.message}`);
        }
    };

    /**
     * Holt die jüngste QRA-Schätzung für ein bestimmtes Quartal.
     * @param {string} targetQuarter - Format 'YYYY-QX' (z.B. '2026-Q3')
     * @returns {Promise<Object|null>} Das Schätz-Objekt oder null.
     */
    const getLatestEstimateForQuarter = async (targetQuarter) => {
        const { data, error } = await supabaseClient
            .from('treasury_qra_estimates')
            .select('*')
            .eq('target_quarter', targetQuarter)
            .order('release_date', { ascending: false })
            .limit(1);

        if (error) {
            throw new Error(`Fehler beim Abrufen der QRA-Schätzung für ${targetQuarter}: ${error.message}`);
        }

        return data && data.length > 0 ? data[0] : null;
    };

    return {
        upsertQraEstimate,
        getLatestEstimateForQuarter
    };
}