

const DB_TABLE = 'treasury_qra_estimates';

export function createQRARepository(supabaseClient) {
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
        estimatedTgaBalance,
        consensusMedian = undefined,
        consensusMin = undefined,
        consensusMax = undefined
    ) => {
        const payload = { 
            target_quarter: targetQuarter,
            release_date: releaseDate,
            estimated_net_borrowing: estimatedNetBorrowing,
            estimated_tga_balance: estimatedTgaBalance
        };
        if (consensusMedian !== undefined) payload.consensus_borrowing_median = consensusMedian;
        if (consensusMin !== undefined) payload.consensus_borrowing_min = consensusMin;
        if (consensusMax !== undefined) payload.consensus_borrowing_max = consensusMax;

        const { error } = await supabaseClient
            .from(DB_TABLE)
            .upsert(payload, { onConflict: 'target_quarter, release_date' });

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
            .from(DB_TABLE)
            .select('*')
            .eq('target_quarter', targetQuarter)
            .order('release_date', { ascending: false })
            .limit(1);

        if (error) {
            throw new Error(`Fehler beim Abrufen der QRA-Schätzung für ${targetQuarter}: ${error.message}`);
        }

        return data && data.length > 0 ? data[0] : null;
    };

    /**
     * Holt die QRA-Schätzung des Vorquartals.
     * Nutzt order by target_quarter absteigend und überspringt das aktuelle.
     */
    const getEstimateForPreviousQuarter = async (currentTargetQuarter) => {
        const { data, error } = await supabaseClient
            .from(DB_TABLE)
            .select('*')
            .lt('target_quarter', currentTargetQuarter)
            .order('target_quarter', { ascending: false })
            .limit(1);

        if (error) {
            throw new Error(`Fehler beim Abrufen des vorherigen Quartals: ${error.message}`);
        }
        return data && data.length > 0 ? data[0] : null;
    };

    /**
     * Speichert den ermittelten Konsens für ein Quartal.
     */
    const saveQraConsensus = async (targetQuarter, min, max, median) => {
        const existing = await getLatestEstimateForQuarter(targetQuarter);
        if (existing) {
            const { error } = await supabaseClient.from(DB_TABLE).update({
                consensus_borrowing_min: min,
                consensus_borrowing_max: max,
                consensus_borrowing_median: median
            }).eq('target_quarter', existing.target_quarter).eq('release_date', existing.release_date);
            if (error) throw new Error(`Fehler beim Update des QRA Konsens: ${error.message}`);
        } else {
            const { error } = await supabaseClient.from(DB_TABLE).insert({
                target_quarter: targetQuarter,
                release_date: new Date().toISOString().split('T')[0], // Dummy/Today Date
                consensus_borrowing_min: min,
                consensus_borrowing_max: max,
                consensus_borrowing_median: median
            });
            if (error) throw new Error(`Fehler beim Insert des QRA Konsens: ${error.message}`);
        }
    };

    return {
        upsertQraEstimate,
        getLatestEstimateForQuarter,
        getEstimateForPreviousQuarter,
        saveQraConsensus
    };
}