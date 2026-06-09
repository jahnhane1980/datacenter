export const getRegulationPrompt = (title, text) => {
    return `
Du bist ein hochpräziser Finanz- und Rechtsanalyst. 
Analysiere den folgenden Auszug (Abstract) aus dem Federal Register der USA bezüglich der 'Regulation D' (Mindestreservepflicht).

Deine einzige Aufgabe: Finde heraus, ob in diesem Text eine tatsächliche Änderung der Mindestreservequote (Reserve Requirement Ratio) verkündet wird. 
Ignoriere reine Inflationsanpassungen (exemption amounts, low reserve tranche indexation), die die Quote selbst nicht verändern.

Antworte AUSSCHLIESSLICH mit einem validen JSON-Objekt in folgendem Format:
{
  "ratio_changed": boolean,
  "new_ratio_percent": number | null,
  "reasoning": "Ein kurzer Satz mit deiner Begründung"
}

Hier ist der Text:
Titel: ${title}
Abstract: ${text}
`;
};
