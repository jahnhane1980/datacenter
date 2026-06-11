import ky from 'ky';
import { getQraSystemPrompt, getQraConsensusSystemPrompt } from '../prompts/qraPrompts.js';
import { getSecSystemPrompt } from '../prompts/secPrompts.js';
import { getRegulationPrompt } from '../prompts/regulationPrompts.js';
import { getMacroAlertSystemPrompt, getMacroAlertUserPrompt } from '../prompts/alertPrompts.js';
import { GoogleGenAI } from '@google/genai';
import { createPacingManager } from '../managers/PacingManager.js';

export class LLMService {
    constructor(pacingManager = createPacingManager()) {
        this.pacingManager = pacingManager;
        this.GROQ_API_KEY = process.env.GROQ_API_KEY;
        this.GEMINI_API_KEY = process.env.GEMINI_API_KEY;

        if (!this.GROQ_API_KEY) {
            throw new Error('GROQ_API_KEY fehlt in der .env oder den GitHub Secrets!');
        }

        if (this.GEMINI_API_KEY) {
            this.aiClient = new GoogleGenAI({ apiKey: this.GEMINI_API_KEY });
        }
    }

    async _queryGroq(systemPrompt, userPrompt, jsonMode = true, maxTokens = 500, retryDelayMs = 10000) {
        let retryCount = 0;
        const maxRetries = 2; 

        while (retryCount <= maxRetries) {
            try {
                const response = await ky.post('https://api.groq.com/openai/v1/chat/completions', {
                    headers: {
                        'Authorization': `Bearer ${this.GROQ_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    json: {
                        model: 'llama-3.1-8b-instant', 
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: userPrompt }
                        ],
                        response_format: jsonMode ? { type: 'json_object' } : undefined,
                        temperature: 0.1,
                        max_tokens: maxTokens
                    },
                    timeout: 30000
                }).json();

                const replyContent = response.choices[0].message.content.trim();
                return jsonMode ? JSON.parse(replyContent) : replyContent;

            } catch (error) {
                if (error.response && error.response.status === 429) {
                    retryCount++;
                    let exactReason = "Unbekanntes Limit";
                    try {
                        const errorBody = await error.response.json();
                        if (errorBody.error && errorBody.error.message) {
                            exactReason = errorBody.error.message;
                        }
                    } catch (e) {}

                    console.log(`  [WARNUNG] 🧨 Groq Rate Limit (429)! Grund: ${exactReason}`);
                    
                    if (exactReason.includes('per day')) {
                        console.log(`  [ABBRUCH] Tageslimit erreicht. Skript muss morgen wieder laufen.`);
                        throw new Error(`429|${exactReason}`); 
                    }

                    console.log(`  -> Zwangspause: ${retryDelayMs / 1000} Sekunden (Versuch ${retryCount}/${maxRetries})...`);
                    await this.pacingManager.sleepMs(retryDelayMs); 
                } else {
                    console.error(`  [GROQ FEHLER] Konnte Request nicht verarbeiten:`, error.message);
                    return null;
                }
            }
        }
        console.log(`  [ABBRUCH] Max Retries für Groq API erreicht.`);
        return null;
    }

    async _queryGemini(prompt, jsonMode = true) {
        if (!this.aiClient) {
            throw new Error('GEMINI_API_KEY fehlt in der .env oder den GitHub Secrets!');
        }

        try {
            const response = await this.aiClient.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: jsonMode ? { responseMimeType: 'application/json' } : {}
            });
            return jsonMode ? JSON.parse(response.text) : response.text;
        } catch (error) {
            if (error.status === 503 || (error.message && error.message.includes('503'))) {
                console.error('\n❌ KRITISCHER FEHLER: Die Google Gemini API ist aktuell überlastet (503 Service Unavailable).');
                console.error('💡 HANDLUNGSEMPFEHLUNG: Da dieses Skript nur wöchentlich läuft, starte den GitHub Workflow bitte in ein paar Stunden manuell neu.\n');
                throw error;
            }
            console.error(`Unbekannter Fehler bei der Gemini LLM-Analyse:`, error.message);
            throw error;
        }
    }

    async parseQraArticle(articleText, url) {
        const systemPrompt = getQraSystemPrompt();
        const userPrompt = `Hier ist der Text des Artikels:\n\n${articleText}`;
        return await this._queryGroq(systemPrompt, userPrompt, true, 500, 10000);
    }

    async parseQraConsensus(newsText) {
        const systemPrompt = getQraConsensusSystemPrompt();
        const userPrompt = `Hier sind die aktuellen News Snippets (heute ist ${new Date().toISOString().split('T')[0]}):\n\n${newsText}`;
        return await this._queryGroq(systemPrompt, userPrompt, true, 500, 10000);
    }

    async analyzeSecSnippet(snippet, metricName, ticker, archetype) {
        const systemPrompt = getSecSystemPrompt(metricName, ticker, archetype);
        const userPrompt = `Hier sind die Textausschnitte:\n\n${snippet}`;
        return await this._queryGroq(systemPrompt, userPrompt, true, 1024, 45000);
    }

    async analyzeMacroEvent(event) {
        const systemPrompt = getMacroAlertSystemPrompt();
        const userPrompt = getMacroAlertUserPrompt(event);
        // jsonMode = false, da wir reinen Text (Plaintext) für Push-Nachrichten wollen
        return await this._queryGroq(systemPrompt, userPrompt, false, 300, 10000);
    }

    async analyzeRegulationDocument(text, title) {
        const prompt = getRegulationPrompt(title, text);
        return await this._queryGemini(prompt, true);
    }
}

export function createLLMService(pacingManager) {
    return new LLMService(pacingManager);
}