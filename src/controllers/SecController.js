import fs from 'fs';
import path from 'path';
import ky from 'ky';
import yahooFinance from 'yahoo-finance2';
import { BaseController } from '../core/BaseController.js';

export class SecController extends BaseController {
    /**
     * @param {Object} secRepo 
     * @param {Object} secService 
     * @param {Object} llmService 
     * @param {Object} pacingManager 
     */
    constructor(secRepo, secService, llmService, pacingManager) {
        super('SecController', pacingManager);
        this.secRepo = secRepo;
        this.secService = secService;
        this.llmService = llmService;
    }

    _cleanHtmlText(html) {
        if (!html) return '';
        let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ');
        text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');
        text = text.replace(/<[^>]+>/g, ' ');
        text = text.replace(/&nbsp;|&#160;/gi, ' ');
        text = text.replace(/\s+/g, ' ').trim();
        return text;
    }

    _extractLlmContext(text, keyword, windowSize = 1500) {
        const results = [];
        const lowerText = text.toLowerCase();
        const lowerKeyword = keyword.toLowerCase();
        
        let startIndex = 0;
        let index;
        
        while ((index = lowerText.indexOf(lowerKeyword, startIndex)) > -1) {
            const start = Math.max(0, index - windowSize);
            const end = Math.min(text.length, index + keyword.length + windowSize);
            
            let snippet = text.substring(start, end);
            const firstSpace = snippet.indexOf(' ');
            const lastSpace = snippet.lastIndexOf(' ');
            if (firstSpace !== -1 && lastSpace !== -1 && firstSpace < lastSpace) {
                snippet = snippet.substring(firstSpace + 1, lastSpace);
            }
            
            results.push(snippet.trim());
            startIndex = index + keyword.length;
        }
        return results;
    }


    async runCikSync() {
        await this.executeJob('SEC CIK-Sync', async () => {
            const missingCiks = await this.secRepo.getCompaniesWithoutCik();
            
            if (missingCiks.length === 0) {
                console.log('Alle aktiven Firmen haben bereits eine CIK hinterlegt. Nichts zu tun.');
                return;
            }

            console.log(`${missingCiks.length} Firmen ohne CIK gefunden. Lade Mapping-Datei von der SEC...`);

            const secMappingData = await this.secService.fetchCikMapping();
            console.log(`Mapping geladen. Durchsuche ${secMappingData.length} SEC-Einträge...`);

            let successCount = 0;
            let notFoundCount = 0;

            await this.processItemsSafely(missingCiks, (c) => c.ticker, async (company) => {
                const tickerToFind = company.ticker.toUpperCase();
                
                const match = secMappingData.find(item => item.ticker === tickerToFind);

                if (match) {
                    const paddedCik = String(match.cik_str).padStart(10, '0');
                    
                    await this.secRepo.updateCompanyCik(tickerToFind, paddedCik);
                    console.log(`[SUCCESS] ${tickerToFind} -> CIK: ${paddedCik} (Company: ${match.title})`);
                    successCount++;
                } else {
                    console.log(`[WARNING] Kein SEC-Eintrag für Ticker '${tickerToFind}' gefunden.`);
                    notFoundCount++;
                }
            });

            console.log('\n--- Sync Report ---');
            console.log(`Erfolgreich aktualisiert: ${successCount}`);
            console.log(`Nicht gefunden: ${notFoundCount}`);
            console.log('Sync beendet!');
        });
    }

    async runMasterSync() {
        await this.executeJob('Master-Sync (Yahoo Hard Facts + Groq AI Radar)', async () => {
            const DEBUG_SAVE_SNIPPETS = process.env.DEBUG_SAVE_SNIPPETS === 'true';
            let snippetDir = path.join(process.cwd(), 'snippets');
            if (DEBUG_SAVE_SNIPPETS && !fs.existsSync(snippetDir)) {
                fs.mkdirSync(snippetDir, { recursive: true });
            }

            const trackedCompanies = await this.secRepo.getTrackedCompanies();
            if (trackedCompanies.length === 0) {
                console.log('Keine aktiven Firmen für den Sync gefunden.');
                return;
            }

            console.log(`${trackedCompanies.length} Firmen im Visier.`);

            await this.processItemsSafely(trackedCompanies, (c) => c.ticker, async (company) => {
                console.log(`\n===========================================`);
                console.log(`VERARBEITE FIRMA: ${company.ticker} [Archetyp: ${company.archetype}]`);
                console.log(`===========================================`);

                try {
                    console.log(`  -> Frage Quartalszahlen bei Yahoo Finance ab...`);
                    
                    const fundamentalsData = await yahooFinance.fundamentalsTimeSeries(company.ticker, {
                        period1: '2023-01-01',
                        module: 'all',
                        type: 'quarterly'
                    });

                    if (fundamentalsData && fundamentalsData.length > 0) {
                        const recentQuarters = fundamentalsData
                            .sort((a, b) => new Date(b.asOfDate || b.date) - new Date(a.asOfDate || a.date))
                            .slice(0, 3);

                        for (const quarter of recentQuarters) {
                            const filingDateStr = quarter.asOfDate || quarter.date;
                            if (!filingDateStr) continue;

                            const dateObj = new Date(filingDateStr);
                            const fiscalYear = dateObj.getFullYear();
                            if (this.pacingManager) await this.pacingManager.humanDelay(2, 6); 
                            const period = `Q${Math.floor(dateObj.getMonth() / 3) + 1}`; 

                            const exists = await this.secRepo.fmpFundamentalExists(company.ticker, fiscalYear, period);
                            
                            if (!exists) {
                                const findValue = (keyPart) => {
                                    const foundKey = Object.keys(quarter).find(k => k.toLowerCase().includes(keyPart.toLowerCase()));
                                    return foundKey ? quarter[foundKey] : null;
                                };

                                const revenue = findValue('TotalRevenue') || findValue('OperatingRevenue');
                                const rnd = findValue('ResearchAndDevelopment');
                                const capex = findValue('CapitalExpenditure');
                                const ocf = findValue('OperatingCashFlow');
                                const inventory = findValue('Inventory');
                                const deferredRev = findValue('DeferredRevenue');
                                const grossProfit = findValue('GrossProfit');
                                const costOfRevenue = findValue('CostOfRevenue');
                                const netReceivables = findValue('AccountsReceivable') || findValue('NetReceivables');

                                const cleanCapex = capex ? Math.abs(capex) : null;
                                let fcf = findValue('FreeCashFlow');
                                if (!fcf && ocf && cleanCapex) { fcf = ocf - cleanCapex; }

                                const grossMargin = grossProfit && revenue ? (grossProfit / revenue) * 100 : null;
                                const turnover = inventory && costOfRevenue ? (costOfRevenue / inventory) : null;
                                const dso = netReceivables && revenue ? (netReceivables / revenue) * 90 : null;

                                await this.secRepo.saveFmpFundamentals({
                                    ticker: company.ticker,
                                    fiscal_year: fiscalYear,
                                    period: period,
                                    filing_date: dateObj.toISOString(),
                                    capex_actual: cleanCapex,
                                    revenue: revenue,
                                    r_and_d: rnd,
                                    inventory_value: inventory,
                                    inventory_turnover: turnover,
                                    days_sales_outstanding: dso,
                                    deferred_revenue: deferredRev,
                                    gross_profit_margin: grossMargin,
                                    operating_cash_flow: ocf,
                                    free_cash_flow: fcf
                                });
                                console.log(`  [YAHOO-SUCCESS] Finanzdaten für ${fiscalYear}-${period} gespeichert.`);
                            } else {
                                console.log(`  [YAHOO-SKIP] Finanzdaten für ${fiscalYear}-${period} bereits vorhanden.`);
                            }
                        }
                    } else {
                         console.log(`  [YAHOO-WARNUNG] Keine Quartalszahlen für ${company.ticker} gefunden.`);
                    }
                } catch (yahooErr) {
                    console.error(`  [YAHOO-FEHLER] Konnte Bilanzen für ${company.ticker} nicht laden:`, yahooErr.message);
                }

                try {
                    const companyKeywords = await this.secRepo.getCompanyKeywords(company.ticker);
                    if (Object.keys(companyKeywords).length === 0) {
                        console.log(`  -> Keine Text-Keywords hinterlegt. Überspringe SEC-Parsing.`);
                        return;
                    }

                    const fetchLimit = company.is_foreign_issuer ? 5 : 3;
                    const recentFilings = await this.secService.fetchLatestFilings(company.cik, company.is_foreign_issuer, fetchLimit);

                    for (const filing of recentFilings) {
                        const exists = await this.secRepo.filingExists(filing.accessionNumber);
                        if (exists) {
                            console.log(`  -> SEC-Bericht ${filing.formType} (${filing.filingDate}) ist bekannt. Überspringe.`);
                            continue;
                        }

                        console.log(`  -> Downloade ${filing.formType} vom ${filing.filingDate} aus der SEC-Datenbank...`);
                        const rawContent = await this.secService.fetchFilingContent(
                            company.cik,
                            filing.accessionNumber,
                            filing.primaryDocument,
                            filing.formType
                        );

                        const newFilingId = await this.secRepo.saveRawFiling(
                            company.ticker,
                            filing.formType,
                            filing.filingDate,
                            filing.accessionNumber,
                            rawContent
                        );

                        const cleanContent = this._cleanHtmlText(rawContent);
                        const aiSignalsToSave = [];
                        let allSnippetsText = `=== SNIPER TEXT-DESTILLAT FÜR ${company.ticker} (${filing.filingDate}) ===\n\n`;

                        for (const [metricName, keywords] of Object.entries(companyKeywords)) {
                            let accumulatedSnippets = [];

                            for (const keyword of keywords) {
                                const snippets = this._extractLlmContext(cleanContent, keyword);
                                if (snippets.length > 0) {
                                    accumulatedSnippets = accumulatedSnippets.concat(snippets.slice(0, 2));
                                }
                            }

                            if (accumulatedSnippets.length > 0) {
                                const combinedContext = accumulatedSnippets.slice(0, 2).join('\n\n[--- NÄCHSTER ABSCHNITT ---]\n\n');
                                
                                if (DEBUG_SAVE_SNIPPETS) {
                                    allSnippetsText += `--- METRIK: ${metricName.toUpperCase()} ---\n${combinedContext}\n\n`;
                                }

                                console.log(`  -> Groq LPU analysiert Kontext für Metrik: '${metricName}'...`);
                                
                                let aiResult = null;
                                try {
                                    console.log(`  [INFO] Proaktiver Pacer: Warte 4 Sekunden...`);
                                    if (this.pacingManager) await this.pacingManager.sleepMs(4000); 

                                    aiResult = await this.llmService.analyzeSecSnippet(combinedContext, metricName, company.ticker, company.archetype);

                                    if (aiResult) {
                                        aiSignalsToSave.push({
                                            filing_id: newFilingId,
                                            ticker: company.ticker,
                                            filing_date: filing.filingDate,
                                            signal_category: metricName,
                                            trend: aiResult.trend,
                                            extracted_quote: aiResult.extracted_quote,
                                            ai_reasoning: aiResult.ai_reasoning
                                        });
                                    }
                                } catch (error) {
                                    if (error.message.startsWith('429')) {
                                        console.log(`  [ABBRUCH] Tageslimit erreicht. Skript muss morgen wieder laufen.`);
                                        throw error; 
                                    }
                                }
                            }
                        }

                        if (DEBUG_SAVE_SNIPPETS && aiSignalsToSave.length > 0) {
                            fs.writeFileSync(path.join(snippetDir, `${company.ticker}_${filing.filingDate}.txt`), allSnippetsText, 'utf-8');
                        }

                        if (aiSignalsToSave.length > 0) {
                            await this.secRepo.saveAiSignals(aiSignalsToSave);
                            console.log(`  -> ${aiSignalsToSave.length} KI-Vektorsignale erfolgreich in 'sec_ai_signals' gespeichert.`);
                        }
                    }
                } catch (secErr) {
                    console.error(`  [SEC-FEHLER] Fehler bei der SEC-Verarbeitung von ${company.ticker}:`, secErr.message);
                }
            });

            console.log('\n===========================================');
            console.log('MASTER-SYNC ERFOLGREICH BEENDET!');
            console.log('===========================================');
        });
    }
}
