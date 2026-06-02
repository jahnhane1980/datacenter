import { supabaseClient } from '../core/SupabaseClient.js';

export function createSecRepository() {
    
    const getCompaniesWithoutCik = async () => {
        const { data, error } = await supabaseClient
            .from('sec_companies')
            .select('ticker')
            .is('cik', null)
            .eq('is_active', true);

        if (error) {
            throw new Error(`Fehler beim Abrufen der Firmen ohne CIK: ${error.message}`);
        }
        return data || [];
    };

    const updateCompanyCik = async (ticker, cik) => {
        const { error } = await supabaseClient
            .from('sec_companies')
            .update({ cik: cik, updated_at: new Date().toISOString() })
            .eq('ticker', ticker);

        if (error) {
            throw new Error(`Fehler beim Update der CIK für ${ticker}: ${error.message}`);
        }
    };

    /**
     * Holt alle aktiven Firmen inklusive ihres Archetyps.
     */
    const getTrackedCompanies = async () => {
        const { data, error } = await supabaseClient
            .from('sec_companies')
            .select('ticker, cik, is_foreign_issuer, archetype')
            .not('cik', 'is', null)
            .eq('is_active', true);

        if (error) {
            throw new Error(`Fehler beim Abrufen der getrackten Firmen: ${error.message}`);
        }
        return data || [];
    };

    const getCompanyKeywords = async (ticker) => {
        const { data, error } = await supabaseClient
            .from('sec_companies_keywords')
            .select('metric_name, keyword')
            .eq('ticker', ticker)
            .eq('is_active', true);

        if (error) {
            throw new Error(`Fehler beim Abrufen der Keywords für ${ticker}: ${error.message}`);
        }

        const keywordMap = {};
        if (data) {
            for (const item of data) {
                if (!keywordMap[item.metric_name]) {
                    keywordMap[item.metric_name] = [];
                }
                keywordMap[item.metric_name].push(item.keyword.toLowerCase());
            }
        }
        return keywordMap;
    };

    const filingExists = async (accessionNumber) => {
        const { data, error } = await supabaseClient
            .from('sec_raw_filings')
            .select('id')
            .eq('accession_number', accessionNumber)
            .maybeSingle();

        if (error) {
            throw new Error(`Fehler bei der Prüfung auf existierendes Filing (${accessionNumber}): ${error.message}`);
        }
        return !!data;
    };

    const saveRawFiling = async (ticker, formType, filingDate, accessionNumber, rawContent) => {
        const { data, error } = await supabaseClient
            .from('sec_raw_filings')
            .insert([{
                ticker,
                form_type: formType,
                filing_date: filingDate,
                accession_number: accessionNumber,
                raw_content: rawContent
            }])
            .select('id')
            .single();

        if (error) {
            throw new Error(`Fehler beim Speichern des Raw Filings für ${ticker}: ${error.message}`);
        }
        return data.id;
    };

    /**
     * NEU: Prüft, ob ein FMP Fundamental-Eintrag bereits existiert (Dubletten-Schutz)
     */
    const fmpFundamentalExists = async (ticker, fiscalYear, period) => {
        const { data, error } = await supabaseClient
            .from('sec_fmp_fundamentals')
            .select('id')
            .eq('ticker', ticker)
            .eq('fiscal_year', fiscalYear)
            .eq('period', period)
            .maybeSingle();

        if (error) return false;
        return !!data;
    };

    /**
     * NEU: Speichert harte FMP-Zahlen in sec_fmp_fundamentals
     */
    const saveFmpFundamentals = async (fundamentalData) => {
        const { error } = await supabaseClient
            .from('sec_fmp_fundamentals')
            .insert([fundamentalData]);

        if (error) {
            throw new Error(`Fehler beim Speichern der FMP Fundamentals: ${error.message}`);
        }
    };

    /**
     * NEU: Speichert weiche KI-Radar Signale in sec_ai_signals
     */
    const saveAiSignals = async (signalsArray) => {
        if (!signalsArray || signalsArray.length === 0) return;

        const { error } = await supabaseClient
            .from('sec_ai_signals')
            .insert(signalsArray);

        if (error) {
            throw new Error(`Fehler beim Speichern der KI-Signale: ${error.message}`);
        }
    };

    return {
        getCompaniesWithoutCik,
        updateCompanyCik,
        getTrackedCompanies,
        getCompanyKeywords,
        filingExists,
        saveRawFiling,
        fmpFundamentalExists,
        saveFmpFundamentals,
        saveAiSignals
    };
}