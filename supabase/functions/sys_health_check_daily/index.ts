import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const NOTIFICATION_EMAIL = Deno.env.get('NOTIFICATION_EMAIL');
serve(async (req)=>{
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response('Unauthorized', {
      status: 401
    });
  }
  if (!RESEND_API_KEY || !NOTIFICATION_EMAIL) {
    console.error("Fehlende Secrets: RESEND_API_KEY oder NOTIFICATION_EMAIL");
    return new Response('Server configuration error', {
      status: 500
    });
  }
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  try {
    // Aggregierte Daten aus der sys_ View holen
    const { data: summary, error } = await supabase.from('sys_daily_insert_summary').select('*');
    if (error) throw error;
    if (!summary || summary.length === 0) {
      return new Response(JSON.stringify({
        message: 'Keine Aktivitäten am heutigen Tag.'
      }), {
        status: 200
      });
    }
    // HTML-Tabellenzeilen dynamisch generieren
    const tableRows = summary.map((row)=>{
      const total = row.insert_count + row.update_count;
      return `
          <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 10px; font-family: monospace; font-size: 13px; color: #333;">${row.table_name}</td>
            <td style="padding: 10px; text-align: center; font-weight: ${row.insert_count > 0 ? 'bold' : 'normal'}; color: ${row.insert_count > 0 ? '#10b981' : '#666'};">${row.insert_count}</td>
            <td style="padding: 10px; text-align: center; font-weight: ${row.update_count > 0 ? 'bold' : 'normal'}; color: ${row.update_count > 0 ? '#3b82f6' : '#666'};">${row.update_count}</td>
            <td style="padding: 10px; text-align: right; font-weight: bold; color: #111;">${total}</td>
          </tr>
        `;
    }).join('');
    // E-Mail senden
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: 'Finance-OS Core <system@resend.dev>',
        to: [
          NOTIFICATION_EMAIL
        ],
        subject: `📊 Data Pipeline: Tägliches Aktivitäts-Protokoll`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #1e293b; margin-bottom: 5px;">Datenbank-Zusammenfassung</h2>
            <p style="color: #64748b; font-size: 14px; margin-top: 0;">Zeitraum: Heute, 00:00 - 23:59 Uhr (Europe/Berlin)</p>
            
            <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
              <thead>
                <tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                  <th style="padding: 10px; text-align: left; color: #475569; font-size: 13px;">Tabelle</th>
                  <th style="padding: 10px; text-align: center; color: #475569; font-size: 13px; width: 80px;">Inserts</th>
                  <th style="padding: 10px; text-align: center; color: #475569; font-size: 13px; width: 80px;">Updates</th>
                  <th style="padding: 10px; text-align: right; color: #475569; font-size: 13px; width: 80px;">Gesamt</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows}
              </tbody>
            </table>
          </div>
        `
      })
    });
    // Alte Log-Einträge bereinigen (behält die letzten 3 Tage als Backup im sys_-Log)
    await supabase.from('sys_insert_logs').delete().lt('created_at', new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString());
    return new Response(JSON.stringify({
      success: true
    }), {
      status: 200
    });
  } catch (err) {
    return new Response(JSON.stringify({
      error: err.message
    }), {
      status: 500
    });
  }
});
