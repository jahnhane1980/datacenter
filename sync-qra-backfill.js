import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import ky from 'ky';
import * as cheerio from 'cheerio';
import { createQRARepository } from './src/repositories/QRARepository.js';
import { createLLMService } from './src/services/LLMService.js';

const DEBUG_SAVE_SNIPPETS = process.env.DEBUG_SAVE_SNIPPETS === 'true';
const QRA_TMP_DIR = path.join(process.cwd(), 'tmp', 'qra');

/**
 * Hilfsfunktion für lokales HTML-Caching.
 * Lädt die Datei von der Festplatte, falls vorhanden, sonst über ky.
 */
async function fetchOrLoadHtml(url, filename, kyOptions) {
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

async function runQRABackfill() {
    console.log('Starte QRA Historical Backfill (Powered by Groq LLM & Local Cache)...');
    
    const TREASURY_BASE_URL = 'https://home.treasury.gov';
    const qraRepository = createQRARepository();
    const llmService = createLLMService();
    
    const TARGET_QUARTERS_TO_FIND = 8; 
    let foundCount = 0;
    let page = 0;

    // Tarnkappe für die Firewall des US-Treasury inkl. 60 Sekunden Timeout
    const kyOptions = {
        timeout: 60000, 
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Connection': 'keep-alive'
        }
    };

    try {
        while (foundCount < TARGET_QUARTERS_TO_FIND && page < 30) {
            
            const pageFilename = `page_${page}.html`;
            const isPageCached = DEBUG_SAVE_SNIPPETS && fs.existsSync(path.join(QRA_TMP_DIR, pageFilename));

            // Sauberes Pacing NUR, wenn wir wirklich das Netzwerk anfunken
            if (page > 0 && !isPageCached) {
                console.log(`  [Pacing] Warte 4 Sekunden, bevor Seite ${page} aufgerufen wird...`);
                await new Promise(res => setTimeout(res, 4000));
            }

            const pageUrl = `${TREASURY_BASE_URL}/news/press-releases?page=${page}`;
            console.log(`\nScrape Übersichtsseite ${page}...`);
            
            const responseText = await fetchOrLoadHtml(pageUrl, pageFilename, kyOptions);
            const $ = cheerio.load(responseText);
            
            const articleLinks = [];

            // 1. Alle potenziellen Links einsammeln
            $('a').each((i, element) => {
                const text = $(element).text().trim().toLowerCase();
                if (text.includes('borrowing estimate') || text.includes('financing estimate') || text.includes('estimated borrowing')) {
                    const href = $(element).attr('href');
                    if (href) {
                        articleLinks.push(href.startsWith('http') ? href : `${TREASURY_BASE_URL}${href}`);
                    }
                }
            });

            // 2. Artikel abarbeiten und an Groq senden
            for (const articleUrl of articleLinks) {
                if (foundCount >= TARGET_QUARTERS_TO_FIND) break;

                console.log(`\nUntersuche historischen Artikel: ${articleUrl}`);
                
                const articleId = articleUrl.split('/').pop(); // Extrahiert z.B. 'sb0485'
                const articleFilename = `article_${articleId}.html`;
                const isArticleCached = DEBUG_SAVE_SNIPPETS && fs.existsSync(path.join(QRA_TMP_DIR, articleFilename));

                // Angepasstes Pacing NUR bei Netzwerkzugriff
                if (!isArticleCached) {
                    console.log(`  [Pacing] Warte 3 Sekunden vor dem Artikel-Download...`);
                    await new Promise(res => setTimeout(res, 3000));
                }
                
                const articleHtml = await fetchOrLoadHtml(articleUrl, articleFilename, kyOptions);
                const $article = cheerio.load(articleHtml);
                
                // Wir extrahieren exakt den Main-Content
                const articleText = $article('div.field--type-text-with-summary, div.clearfix.text-formatted').text() || $article('body').text();

                console.log(`  -> Sende Artikel-Text an Groq Llama 3.1 zur Extraktion...`);
                
                const aiResult = await llmService.parseQraArticle(articleText, articleUrl);

                if (aiResult && aiResult.target_quarter && aiResult.release_date) {
                    await qraRepository.upsertQraEstimate(
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
            }
            
            page++;
        }

        console.log(`\n🎉 Groq Backfill abgeschlossen! Es wurden ${foundCount} historische QRA-Quartale geladen.`);

    } catch (error) {
        console.error('Kritischer Fehler im QRA Backfill-Skript:', error);
        process.exit(1);
    }
}

runQRABackfill();