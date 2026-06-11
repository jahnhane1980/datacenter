export function buildTreasuryAuctionPrompt(auctionData, historyStats) {
    const systemPrompt = `Du bist ein erfahrener Fixed Income Experte und Bond-Trader.
Deine Aufgabe ist es, das Ergebnis einer US Treasury Auktion blitzschnell und präzise für einen Portfoliomanager zusammenzufassen.
Bewerte die Nachfrage (Bid-to-Cover) und wer die Bonds gekauft hat (Dealers vs. Direct vs. Indirect Bidders) im Vergleich zum historischen Durchschnitt.
Formatiere deine Antwort knackig (max 3-4 Sätze) und gib ein klares Fazit für die Liquidität und Marktstimmung.
Schreibe auf Deutsch.`;

    let tailInfo = '';
    if (auctionData.proxy_tail !== undefined && auctionData.proxy_tail !== null) {
        // proxy_tail wird in % gespeichert, wir geben ihn gerne in Basispunkten (bps) an, indem wir mit 100 multiplizieren.
        const bps = (auctionData.proxy_tail * 100).toFixed(1);
        tailInfo = `Proxy Tail: ${bps} bps (Sekundärmarkt: ${auctionData.secondary_market_yield}%)\n`;
    }

    const userPrompt = `Auktions-Ergebnis: ${auctionData.security_term}
Datum: ${auctionData.auction_date}
Bid-to-Cover (BTC): ${auctionData.bid_to_cover_ratio} (Historischer 6er-Schnitt: ${historyStats.avgBtc.toFixed(2)})
High Yield: ${auctionData.high_yield}% (Historischer 6er-Schnitt: ${historyStats.avgYield.toFixed(2)}%)
${tailInfo}Zuteilung:
- Primary Dealers: ${auctionData.primary_pct.toFixed(1)}% (Historisch: ${historyStats.avgPrimary.toFixed(1)}%)
- Direct Bidders: ${auctionData.direct_pct.toFixed(1)}% (Historisch: ${historyStats.avgDirect.toFixed(1)}%)
- Indirect Bidders: ${auctionData.indirect_pct.toFixed(1)}% (Historisch: ${historyStats.avgIndirect.toFixed(1)}%)

Bitte analysiere diese Auktion kurz und treffend. Achte besonders auf den Tail, falls er angegeben ist (Positiv = schwache Nachfrage, Negativ/Stop-Through = starke Nachfrage).`;

    return { systemPrompt, userPrompt };
}
