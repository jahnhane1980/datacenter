export const getSecSystemPrompt = (metricName, ticker, archetype) => {
    let baseInstruction = '';

    if (archetype === 'HYPERSCALER') {
        baseInstruction = `Du analysierst ${ticker}, einen großen Tech-Hyperscaler (Nachfrageseite). 
        Finde heraus, ob das Unternehmen seine CapEx-Infrastrukturausgaben für KI/Server aggressiv hochfährt, optimiert oder drosselt.`;
    } else if (archetype === 'FOUNDRY') {
        baseInstruction = `Du analysierst ${ticker}, einen Halbleiter-Auftragsfertiger/Packager (Angebotsseite).
        Finde explizite Aussagen zur Fabrik-Auslastung (Capacity Utilization) oder zu Lagerkorrekturen (Inventory Adjustments) der Kunden.`;
    } else if (archetype === 'EQUIPMENT') {
        baseInstruction = `Du analysierst ${ticker}, einen Zulieferer für Fabrikmaschinen (Equipment Frühindikator).
        Finde heraus, ob sich die Auftragsbücher (Order Intake, Bookings, Backlog) füllen oder leeren.`;
    } else if (archetype === 'MEMORY') {
        baseInstruction = `Du analysierst ${ticker}, einen High-Bandwidth-Memory Speicherproduzenten.
        Finde heraus, wie sich die Nachfrage nach HBM entwickelt und ob die Preise (Average Selling Prices) steigen oder fallen.`;
    } else if (archetype === 'SOFTWARE') {
        baseInstruction = `Du analysierst ${ticker}, ein Enterprise-Softwareunternehmen (SaaS).
        Finde heraus, wie sich das verbleibende Auftrags- oder Abo-Volumen (cRPO / Deferred Revenue) entwickelt und ob KI-Software erfolgreich monetarisiert wird.`;
    } else {
        baseInstruction = `Analysiere das Text-Snippet für die Metrik ${metricName}.`;
    }

    return `${baseInstruction}
        Regeln:
        1. Entscheide dich beim Trend für exakt einen dieser Vektoren:
           - 'EXPANSION' (Ausbau, Erhöhung, starkes Wachstum)
           - 'CONTRACTION' (Schrumpfung, Kürzung, Einbruch)
           - 'OPTIMIZATION' (Nutzung vorhandener Ressourcen optimieren, Lebenszeit verlängern, zurückhaltend)
           - 'OVERCAPACITY' (Warnsignal! Auslastung fällt, Kunden stornieren, Lager laufen voll)
           - 'FLAT' (Keine nennenswerte Änderung)
        2. Extrahiere das prägnanteste Original-Zitat (maximal 1-2 Sätze) als 'extracted_quote'.
        3. WICHTIG: Ignoriere generische Erklärungen aus dem Rechnungswesen, rechtliche Patentstreitigkeiten sowie hypothetische Risikofaktoren (z.B. 'If demand drops...'). Bewerte AUSSCHLIESSLICH tatsächliche, physische Geschäftsereignisse und aktuelle Quartalsergebnisse.
        
        Du musst AUSSCHLIESSLICH in JSON antworten. Nutze exakt dieses JSON-Format:
        {
          "trend": "EXPANSION",
          "extracted_quote": "Original-Satz aus dem Text",
          "ai_reasoning": "Kurze Begründung"
        }`;
};
