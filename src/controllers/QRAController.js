import fs from 'fs';
import path from 'path';
import ky from 'ky';
import * as cheerio from 'cheerio';
import { BaseController } from '../core/BaseController.js';

const DEBUG_SAVE_SNIPPETS = process.env.DEBUG_SAVE_SNIPPETS === 'true';
const QRA_TMP_DIR = path.join(process.cwd(), 'tmp', 'qra');

export class QRAController extends BaseController {
    /**
     * @param {Object} qraRepository 
     * @param {Object} qraService 
     * @param {Object} llmService 
     * @param {Object} pacingManager 
     */
    constructor(qraRepository, qraService, llmService, pacingManager) {
        super('QRAController', pacingManager);
        this.qraRepository = qraRepository;
        this.qraService = qraService;
        this.llmService = llmService;
    }

    /**
     * Hilfsfunktion für lokales HTML-Caching.
     */
    async fetchOrLoadHtml(url, filename, kyOptions) {
        const filePath = path.join(QRA_TMP_DIR, filename);

        if (DEBUG_SAVE_SNIPPETS && fs.existsSync(filePath)) {
            console.log(`  [Cache] Lade lokales HTML: ${filename}`);
            return fs.readFileSync(filePath, 'utf-8');
        }

        console.log(`  [Netzwerk] Lade Live-HTML: ${url}`);
        const responseText = await ky.get(url, kyOptions).text();

        if (DEBUG_SAVE_SNIPPETS) {
            if (!fs.existsSync(QRA_TMP_DIR)) {
                fs.mkdirSync(QRA_TMP_DIR, { recursive: true });
            }
            fs.writeFileSync(filePath, responseText, 'utf-8');
            console.log(`  [Cache] HTML gespeichert unter: ${filename}`);
        }

        return responseText;
    }

    /**
     * Führt den täglichen Sync aus (falls der aktuelle Monat ein QRA-Monat ist).
     */
    async runSync() {
        await this.executeJob('QRA (Forward Guidance) Sync', async () => {
            const now = new Date();
            const month = now.getMonth() + 1;
            const qraMonths = [2, 5, 8, 11];

            if (!qraMonths.includes(month)) {
                console.log(`[Skip] Aktueller Monat (${month}) ist kein QRA-Monat. Sync wird beendet.`);
                return;
            }

            console.log('Prüfe Treasury-Website auf neue Financing Estimates...');
            const estimate = await this.qraService.fetchLatestFinancingEstimates();

            if (!estimate) {
                console.log('Keine neuen QRA-Daten gefunden. Eventuell ist der Termin noch nicht erreicht.');
                return;
            }

            const { EventBus } = await import('../core/EventBus.js').catch((err) => {
                console.error('Konnte EventBus nicht importieren:', err.message);
                return { EventBus: null };
            });

            console.log(`Daten für Quartal ${estimate.targetQuarter} gefunden. Führe Upsert durch...`);

            // Prüfen, ob wir die Daten schon hatten oder ob sich was geändert hat
            let oldEstimate = null;
            try {
                oldEstimate = await this.qraRepository.getLatestEstimateForQuarter(estimate.targetQuarter);
            } catch (err) {
                console.error('Konnte alten QRA-Status nicht prüfen:', err.message);
            }

            await this.qraRepository.upsertQraEstimate(
                estimate.targetQuarter,
                estimate.releaseDate,
                estimate.estimatedNetBorrowing,
                estimate.estimatedTgaBalance
            );

            // Event feuern, wenn es komplett neu ist oder sich die TGA-Balance geändert hat
            if (EventBus) {
                if (!oldEstimate) {
                    EventBus.emit('QRAController', 'qra_estimate_added', estimate);
                } else if (Number(oldEstimate.estimated_tga_balance) !== estimate.estimatedTgaBalance) {
                    EventBus.emit('QRAController', 'qra_estimate_updated', { 
                        old_tga: oldEstimate.estimated_tga_balance, 
                        new_estimate: estimate 
                    });
                }
            }

            const tgaBillion = estimate.estimatedTgaBalance ? (estimate.estimatedTgaBalance / 1_000_000_000).toFixed(0) : 'N/A';
            console.log(`✅ QRA Sync erfolgreich! Target Quarter: ${estimate.targetQuarter} | TGA Ziel: $${tgaBillion} Mrd.`);
        });
    }

    /**
     * Führt den historischen Backfill via Groq LLM durch.
     */
    async runBackfill() {
        await this.executeJob('QRA Historical Backfill (Powered by Groq LLM & Local Cache)', async () => {
            const TREASURY_BASE_URL = 'https://home.treasury.gov';
            const TARGET_QUARTERS_TO_FIND = 8; 
            let foundCount = 0;
            let page = 0;

            const kyOptions = {
                timeout: 60000, 
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Connection': 'keep-alive'
                }
            };

            while (foundCount < TARGET_QUARTERS_TO_FIND && page < 30) {
                const pageFilename = `page_${page}.html`;
                const isPageCached = DEBUG_SAVE_SNIPPETS && fs.existsSync(path.join(QRA_TMP_DIR, pageFilename));

                if (page > 0 && !isPageCached && process.env.NODE_ENV !== 'test') {
                    console.log(`  [Pacing] Warte 4 Sekunden, bevor Seite ${page} aufgerufen wird...`);
                    if (this.pacingManager) await this.pacingManager.sleepMs(4000);
                }

                const pageUrl = `${TREASURY_BASE_URL}/news/press-releases?page=${page}`;
                console.log(`\nScrape Übersichtsseite ${page}...`);
                
                const responseText = await this.fetchOrLoadHtml(pageUrl, pageFilename, kyOptions);
                const $ = cheerio.load(responseText);
                
                const articleLinks = [];

                $('a').each((i, element) => {
                    const text = $(element).text().trim().toLowerCase();
                    if (text.includes('borrowing estimate') || text.includes('financing estimate') || text.includes('estimated borrowing')) {
                        const href = $(element).attr('href');
                        if (href) {
                            articleLinks.push(href.startsWith('http') ? href : `${TREASURY_BASE_URL}${href}`);
                        }
                    }
                });

                await this.processItemsSafely(articleLinks, (url) => url, async (articleUrl) => {
                    if (foundCount >= TARGET_QUARTERS_TO_FIND) return;

                    console.log(`\nUntersuche historischen Artikel: ${articleUrl}`);
                    
                    const articleId = articleUrl.split('/').pop();
                    const articleFilename = `article_${articleId}.html`;
                    const isArticleCached = DEBUG_SAVE_SNIPPETS && fs.existsSync(path.join(QRA_TMP_DIR, articleFilename));

                    if (!isArticleCached && process.env.NODE_ENV !== 'test') {
                        console.log(`  [Pacing] Warte 3 Sekunden vor dem Artikel-Download...`);
                        if (this.pacingManager) await this.pacingManager.sleepMs(3000);
                    }
                    
                    const articleHtml = await this.fetchOrLoadHtml(articleUrl, articleFilename, kyOptions);
                    const $article = cheerio.load(articleHtml);
                    
                    const articleText = $article('div.field--type-text-with-summary, div.clearfix.text-formatted').text() || $article('body').text();

                    console.log(`  -> Sende Artikel-Text an Groq Llama 3.1 zur Extraktion...`);
                    
                    const aiResult = await this.llmService.parseQraArticle(articleText, articleUrl);

                    if (aiResult && aiResult.target_quarter && aiResult.release_date) {
                        await this.qraRepository.upsertQraEstimate(
                            aiResult.target_quarter, 
                            aiResult.release_date, 
                            aiResult.estimated_net_borrowing, 
                            aiResult.estimated_tga_balance
                        );
                        
                        foundCount++;
                        console.log(`✅ Upsert erfolgreich: ${aiResult.target_quarter} (Release: ${aiResult.release_date} | TGA Ziel: $${aiResult.estimated_tga_balance ? aiResult.estimated_tga_balance / 1_000_000_000 : 'N/A'} Mrd.). [${foundCount}/${TARGET_QUARTERS_TO_FIND}]`);
                    } else {
                        console.log(`❌ Groq konnte keine validen QRA-Daten aus diesem Text extrahieren.`);
                    }
                });
                page++;
            }
            console.log(`\n🎉 Groq Backfill abgeschlossen! Es wurden ${foundCount} historische QRA-Quartale geladen.`);
        });
    }
}
