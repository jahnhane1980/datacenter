import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
// CORS-Header für die Edge Function
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
// === DER NEUE MAKRO-FILTER ===
function isRelevantMacroNews(headline, summary) {
  // Verbinde Headline und Summary und wandle alles in Kleinbuchstaben um
  const text = `${headline} ${summary}`.toLowerCase();
  // 1. Makro & Geopolitik (exakte Wortgrenzen \b, um false positives zu vermeiden)
  const macroRegex = /\b(oil|crude|brent|wti|dollar|usd|dxy|interest rates?|rate hikes?|fed|fomc|kevin warsh|central bank|ecb|boe|boj|inflation|cpi|pce|recession|gdp|nfp|unemployment|pmi|yield curve|treasury|tariffs|trade war|opec|middle east|geopolitics?|war|conflict|israel|iran|russia|ukraine|china|taiwan|sanctions?)\b/i;
  if (macroRegex.test(text)) return true;
  // 2. Spezifische Aktien-Ausnahmen (Nvidia, TSMC, ASML, AMD)
  const techRegex = /\b(nvidia|nvda|tsmc|tsm|asml|amd)\b/i;
  if (techRegex.test(text)) return true;
  // 3. Hyperscaler + CapEx Logik (MUSS beides enthalten)
  const hyperscalerRegex = /\b(hyperscaler|microsoft|msft|google|googl|alphabet|amazon|amzn|meta)\b/i;
  const capexRegex = /\b(capex|capital expenditure|datacenter|data center|ai infrastructure)\b/i;
  if (hyperscalerRegex.test(text) && capexRegex.test(text)) return true;
  // Wenn keine der Bedingungen zutrifft: Rauschen!
  return false;
}
serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    const alpacaKey = Deno.env.get('ALPACA_KEY_ID');
    const alpacaSecret = Deno.env.get('ALPACA_SECRET_KEY');
    const ntfyUrl = Deno.env.get('NTFY_TOPIC_URL');
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!alpacaKey || !alpacaSecret || !ntfyUrl) {
      throw new Error("Missing essential environment variables (Alpaca or NTFY).");
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // === CLEANUP: Alte Einträge löschen (älter als 7 Tage) ===
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const { error: deleteError } = await supabase
      .from('macro_news_logs')
      .delete()
      .lt('published_at', sevenDaysAgo.toISOString());
      
    if (deleteError) {
      console.error("Database cleanup error:", deleteError);
    }
    // Limit auf 150 erhöht, da wir nun für 2-stündige Scans mehr Artikel erfassen müssen
    const alpacaUrl = "https://data.alpaca.markets/v1beta1/news?limit=150&exclude_contentless=true";
    const alpacaResponse = await fetch(alpacaUrl, {
      method: "GET",
      headers: {
        "Apca-Api-Key-Id": alpacaKey,
        "Apca-Api-Secret-Key": alpacaSecret
      }
    });
    if (!alpacaResponse.ok) {
      throw new Error(`Alpaca API responded with status: ${alpacaResponse.status}`);
    }
    const newsData = await alpacaResponse.json();
    const articles = newsData.news || [];
    let newArticlesCount = 0;
    const collectedArticles: any[] = [];
    for (const article of articles){
      // === FILTER ANWENDEN ===
      // Wenn der Artikel unser Makro-Raster nicht besteht, sofort überspringen
      if (!isRelevantMacroNews(article.headline, article.summary || '')) {
        continue;
      }
      // Versuch, den gefilterten Artikel in die Datenbank einzufügen
      const { error: insertError } = await supabase.from('macro_news_logs').insert({
        alpaca_id: article.id,
        headline: article.headline,
        summary: article.summary,
        author: article.author,
        url: article.url,
        source: article.source,
        published_at: article.created_at
      });
      if (insertError) {
        if (insertError.code === '23505') {
          continue; // Existiert bereits -> überspringen
        } else {
          console.error("Database insert error:", insertError);
          continue;
        }
      }
      newArticlesCount++;
      collectedArticles.push(article);
    }
    if (collectedArticles.length > 0) {
      const groqApiKey = Deno.env.get('GROQ_API_KEY');
      const urlObj = new URL(ntfyUrl);
      const ntfyBaseUrl = urlObj.origin;
      const topic = urlObj.pathname.replace('/', '');
      let ntfyMessage = "";
      let ntfyTitle = "";
      if (groqApiKey) {
        // Bereite Text für KI vor
        const promptText = collectedArticles.map((a, i) => `Artikel ${i+1}:\nTitel: ${a.headline}\nZusammenfassung: ${a.summary}\nURL: ${a.url}\n`).join("\n");
        try {
          const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${groqApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: "llama3-70b-8192",
              messages: [
                {
                  role: "system",
                  content: "Du bist ein erfahrener Finanz-Analyst. Filtere irrelevantes Rauschen heraus. Fokussiere dich AUSSCHLIESSLICH auf Themen, die folgende Kernbereiche berühren: 1. Makro & Zentralbanken: Inflation (CPI, PCE), Leitzinsen, Zentralbanken (Fed, EZB, BoE, BoJ), Dollar (DXY). 2. Konjunktur & Handel: Arbeitsmarktdaten (NFP, Unemployment), Rezessionssorgen (GDP, PMI), Anleiherenditen, Zölle (Tariffs) und Handelskriege. 3. Geopolitik & Rohstoffe: Ölpreise (WTI, Brent, OPEC), Naher Osten (Israel, Iran), Russland/Ukraine, China/Taiwan, Sanktionen. 4. Tech & Datacenter: Große Hyperscaler und Chip-Hersteller (Nvidia, TSMC, ASML, AMD, Microsoft, Google, Amazon, Meta), insbesondere im Kontext von Capital Expenditures (CapEx) und Datacenter / AI Infrastructure. WICHTIG: Erkennst du mehrere Artikel zum exakt gleichen Thema (z.B. ein Hin und Her bei Konflikten), fasse diese zu einem einzigen Punkt zusammen und präsentiere nur den aktuellsten Stand bzw. das Gesamtergebnis. Vermeide es, jede Zwischenmeldung einzeln aufzulisten. Schreibe eine knackige, professionelle und gut lesbare Zusammenfassung auf Deutsch. Verlinke die URL zu jeder genutzten Nachricht. Wenn keine der Nachrichten wichtig ist, antworte exakt mit 'Keine signifikanten Makro-News'."
                },
                {
                  role: "user",
                  content: promptText
                }
              ],
              temperature: 0.3
            })
          });
          if (groqResponse.ok) {
            const groqData = await groqResponse.json();
            ntfyMessage = groqData.choices[0].message.content;
            ntfyTitle = `🤖 KI Macro Summary (${newArticlesCount} Artikel)`;
          } else {
            console.error("Groq API Error:", await groqResponse.text());
            ntfyMessage = "Groq API Fehler. Gefilterte Artikel:\n\n" + collectedArticles.map(a => `- ${a.headline} (${a.url})`).join("\n");
            ntfyTitle = `⚠️ Macro News Fallback (${newArticlesCount} Artikel)`;
          }
        } catch (groqErr) {
          console.error("Exception during Groq call:", groqErr);
          ntfyMessage = "Fehler bei Groq Anfrage. Gefilterte Artikel:\n\n" + collectedArticles.map(a => `- ${a.headline} (${a.url})`).join("\n");
          ntfyTitle = `⚠️ Macro News Fallback (${newArticlesCount} Artikel)`;
        }
      } else {
        // Fallback wenn kein API Key da ist
        ntfyMessage = "Kein GROQ_API_KEY gefunden. Artikel:\n\n" + collectedArticles.map(a => `- ${a.headline} (${a.url})`).join("\n");
        ntfyTitle = `🚨 Macro News (${newArticlesCount} Artikel)`;
      }
      // Sende NTFY falls KI nicht "Keine signifikanten Makro-News" geantwortet hat
      if (!ntfyMessage.includes("Keine signifikanten Makro-News")) {
        await fetch(ntfyBaseUrl, {
          method: 'POST',
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            topic: topic,
            title: ntfyTitle,
            tags: ["robot", "chart_with_upwards_trend"],
            message: ntfyMessage.substring(0, 4000)
          })
        });
      }
    }
    return new Response(JSON.stringify({
      message: "Job finished successfully",
      processed: articles.length,
      new_alerts_sent: newArticlesCount
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    console.error("Function error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 500
    });
  }
});
