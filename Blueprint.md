# FinanceOS - System Blueprint

## 1. Was dieses Projekt macht (Die Vision & Aufgaben)
**FinanceOS** ist eine hochgradig automatisierte Orchestrierungs- und Analyse-Engine für quantitative Makro-Ökonomie und Finanzmärkte. Es dient als "leises Gehirn" im Hintergrund, das autonom Marktdaten sammelt, interpretiert und verdichtetes Wissen an einen Investor ausliefert.

**Die Kernaufgaben umfassen:**
* **Autonome Datenbeschaffung (Syncing):** Über dedizierte, zeitgesteuerte GitHub-Actions (Cron-Jobs) sammelt das System täglich, wöchentlich oder minütlich (M5-Kerzen) Finanzdaten von verschiedensten Providern (Polygon.io, FRED, Finnhub, CBOE, SEC, Treasury etc.).
* **Zentraler Datenspeicher:** Alle Daten (Aktienkerzen, Treasury-Auktionen, Optionen, Wirtschaftsdaten, QRA-Schätzungen) werden strukturiert in einer zentralen Supabase-Datenbank (PostgreSQL) abgelegt und historisiert.
* **Event-Driven Architecture:** Wenn während eines Syncs etwas Wichtiges passiert (z.B. eine neue Treasury-Auktion wurde beendet, neue Liquiditätsdaten sind verfügbar, SEC-Filings wurden entdeckt), wird ein Event auf den internen `EventBus` gelegt.
* **KI-gestützte Auswertung (ActionRouter & LLM):** Der Alerting-Orchestrator liest diese Events und leitet sie an spezifische Action-Klassen weiter. Diese Klassen füttern die rohen Zahlen sowie historische Durchschnittswerte an ein Large Language Model (Groq oder Gemini). Das LLM interpretiert die Daten ("Ist das bullish oder bearish für den Markt?") und erstellt prägnante, aufbereitete Analysen.
* **Push-Benachrichtigungen:** Die fertigen KI-Analysen werden als Alerts in Echtzeit direkt an den Nutzer gesendet (z.B. als Push-Nachricht auf das Handy), sodass dieser sofort informiert ist, ohne selbst Charts oder Excel-Tabellen wälzen zu müssen.
* **Stealth & Pacing:** Ein intelligenter `PacingManager` fügt absichtliche "menschliche" Wartezeiten (bis hin zu simulierten Kaffeepausen) ein, um bei Scrape- oder API-Zugriffen nicht als stumpfer Bot blockiert zu werden.

---

## 2. Struktur des Projektes (Wer macht was?)

Die Architektur folgt einem klaren MVC/Service-Muster, gepaart mit Event-Sourcing.

### ⚙️ `.github/workflows/`
Das Herzstück der Automatisierung. Hier liegen die YAML-Dateien (z.B. `sync-qra.yml`, `sync-m5.yml`), die als Taktgeber fungieren. Sie starten isolierte Ubuntu-Server in der Cloud, installieren die Abhängigkeiten und führen die eigentlichen Node.js-Skripte nach einem präzisen Zeitplan aus. Jeder Durchlauf endet mit dem Aufruf der `alert.js`.

### 🚀 Root-Ebene (`alert.js`, `sync.js` etc.)
Das sind die Einstiegspunkte (Entrypoints) für die GitHub-Workflows. 
* `sync.js`: Startet je nach übergebenem Parameter den richtigen Controller, um Daten zu laden.
* `alert.js`: Liest die temporäre Event-Datei (`tmp_event/sys_events.json`), jagt sie durch den `ActionRouter` und löscht sie danach.

### 🧠 `src/core/`
Das Fundament der Applikation.
* **`ActionRouter.js` & `EventBus.js`**: Das Nervensystem. Der EventBus schreibt Vorfälle in eine Datei, der ActionRouter liest sie und entscheidet, welche `Action`-Klasse darauf reagieren muss.
* **`SupabaseClient.js`**: Die zentrale Datenbankverbindung.
* **`DateHelper.js`**: Utility für komplexe Datumsberechnungen und Zeitzonen-Management.
* **`BaseController.js`**: Die Basisklasse für alle Controller, die Standardfunktionen (Fehlerbehandlung, Retry-Schleifen) bereitstellt.

### 🎮 `src/controllers/`
Die "Macher". Sie steuern den Ablauf eines spezifischen Jobs. Ein Controller (z.B. `FiscalController` oder `DailyController`) holt sich Daten über einen *Service*, formatiert sie bei Bedarf und speichert sie über ein *Repository* in der Datenbank. Wenn relevant, feuert der Controller danach ein Event ab.

### 🛠️ `src/services/`
Die Schnittstellen nach draußen. Hier liegt die Logik, um externe APIs oder Webseiten anzusprechen.
* **API-Wrapper:** `PolygonIoService`, `FredService`, `YahooService`, `SecService`.
* **LLM-Wrapper:** `LLMService` (Verbindung zu Groq Llama-Modellen und Google Gemini zur Textanalyse).
* **Notification:** `NotificationService` zum Senden der Push-Nachrichten.

### 🗄️ `src/repositories/`
Die Datenbank-Schicht. Jede Klasse kapselt die Supabase-SQL-Logik. Wenn ein Controller Daten lesen oder schreiben will, nutzt er das Repository (z.B. `OptionRepository` oder `QRARepository`). Dies trennt die Business-Logik sauber von der Datenbank-Technologie.

### 🎬 `src/actions/`
Die "Reagierenden". Wenn der `ActionRouter` ein Event erkennt, triggert er die passende Action (z.B. `TreasuryAuctionAction` oder `NetLiquidityAction`). Die Action holt sich ggf. noch fehlende Historien-Daten aus den Repositories, formt sie zu einem Prompt, ruft die KI an und verschickt das Resultat.

### 📝 `src/prompts/`
Eine Bibliothek von reinen Text-Vorlagen. Hier sind die exakten System- und User-Prompts gespeichert, die der KI ihre "Persona" geben (z.B. "Du bist ein quantitativer Makro-Analyst...").

### ⏱️ `src/managers/`
Zentrale Verwalter für projektweite Status- oder Limitierungen. Besonders hervorzuheben ist der `PacingManager`, der die Geschwindigkeit der API-Requests und Scrapes kontrolliert, um Sperren zu vermeiden.

### 🧪 `tests/`
Das Sicherheitsnetz. Spiegelt exakt die Struktur von `src/` wider und enthält Unit-Tests (via Vitest), die sicherstellen, dass Controller, Repositories und Actions fehlerfrei laufen und Fallbacks korrekt triggern.

---

## 3. Das Event-System im Detail

Das Event-System (Event-Driven Architecture) ermöglicht es dem System, asynchron und isoliert auf neue Daten zu reagieren, ohne dass der Daten-Fetcher (Controller) selbst Benachrichtigungen verschicken muss.

**Wie es grob funktioniert:**
1. **Emit:** Wenn ein Controller (z.B. der `FiscalController` oder `FredController`) neue, relevante Daten in die Datenbank geschrieben hat, ruft er `EventBus.emit('event_name', details)` auf.
2. **Speicherung:** Der `EventBus` speichert dieses Event als JSON in einer temporären Datei (`tmp_event/sys_events.json`).
3. **Routing:** Sobald der eigentliche Daten-Sync-Workflow beendet ist, startet GitHub Actions automatisch die `alert.js`. Diese liest alle in der Datei gesammelten Events aus, leitet sie an den `ActionRouter` weiter und löscht die Datei anschließend.
4. **Action:** Der `ActionRouter` schaut in seine Map und übergibt das Event an die zuständige Action-Klasse (z.B. `QRAAction`), welche dann historische Daten lädt, die KI befragt und die finale Push-Benachrichtigung an den Nutzer feuert.

**Aktuelle Events, bei denen wir benachrichtigt werden:**
Aktuell lauscht der `ActionRouter` auf folgende spezifische Events und leitet entsprechende Alerts ab:
* `treasury_auction_filled` -> Getriggert durch den `FiscalController`, wenn eine Treasury-Auktion beendet wurde. (Wird von der `TreasuryAuctionAction` analysiert inkl. historischem Bid-to-Cover Durchschnitt).
* `liquidity_update` -> Getriggert durch den `FredController`, wenn Fed-Bilanz, TGA oder Reverse Repo geupdatet wurden. (Erzeugt einen Net-Liquidity-Alert via `NetLiquidityAction`).
* `qra_estimate_added` & `qra_estimate_updated` -> Getriggert durch den `QRAController`, wenn offizielle "Quarterly Refunding Announcements" reinkommen. (Wird durch die `QRAAction` im Makro-Kontext analysiert).
* `central_bank_update` -> Getriggert bei allgemeinen Zentralbank-Updates. (Geht an die `GenericMacroAction` für eine schnelle KI-Zusammenfassung).
* `labor_market_update` -> Getriggert bei neuen US-Arbeitsmarktdaten. (Geht ebenfalls an die `GenericMacroAction`).

---

## 4. Datenmodell & Tabellen-Struktur (Der Datenschatz)

Die Supabase-Datenbank ist extrem vielfältig aufgebaut und vereint klassische Chart-Daten mit Makro-Wirtschaftszahlen und Text-Analysen.

**Die wichtigsten Tabellen und ihre Funktion:**
* **`ticker_data_config`**: Das Steuerpult. Hier wird definiert, welche Aktien, ETFs oder Indizes überhaupt getrackt werden und welche Sync-Jobs für sie aktiv sind (z.B. Daily-Kerzen, M5-Kerzen, Options-Ketten).
* **`market_daily_candles` / `market_m5_candles`**: Die klassischen OHLCV-Chartdaten (Open, High, Low, Close, Volume). Für M5 (5-Minuten) gibt es zusätzlich eine `archive_market_m5_log`-Tabelle, da diese Datenmengen schnell riesig werden und nach einer Weile archiviert werden müssen.
* **`market_fiscal_treasury_auctions`**: Speichert die Ergebnisse der US-Schuldenauktionen. *Wichtige Berechnung:* Die `TreasuryAuctionAction` berechnet aus den letzten 6 Einträgen den Durchschnitt der `bid_to_cover_ratio` (Nachfrage nach US-Anleihen) und der `high_yield`, um sofort zu erkennen, ob die aktuelle Auktion ein Erfolg oder Flop war.
* **`market_macro_liquidity`**: Speichert Daten der US-Notenbank (FRED). *Wichtige Berechnung:* Die Netto-Liquidität (`Net Liquidity`) wird in der Action berechnet durch `Fed Bilanzsumme - TGA (Treasury General Account) - RRP (Reverse Repo)`. Steigt dieser Wert, drückt das in der Regel Liquidität in den Aktienmarkt (Bullish).
* **`market_fiscal_qra_estimates`**: Hier wird erfasst, wie viel Geld das US-Finanzministerium im nächsten Quartal leihen will (`estimated_net_borrowing`) und was der Markt vorher erwartet hatte (`consensus_borrowing_median`). Abweichungen bewegen die Anleihenmärkte massiv.
* **`market_options_chain_snapshots` / `contract_bars`**: Speichert Optionsketten. Diese Daten sind essenziell, um das *Put/Call-Ratio* oder massiven Volumenaufbau auf bestimmten Strike-Preisen (Options Flow) zu berechnen – ein exzellenter Indikator für Markt-Sentiment (Angst vs. Gier).
* **`sec_filings` & `market_sentiment_news`**: Speichern textbasierte Dokumente (10-K, 10-Q Berichte von Unternehmen oder News-Artikel). Hier rechnet kein klassischer Algorithmus, sondern das LLM liest die Texte, extrahiert Risikofaktoren und speichert das ermittelte *Sentiment* zurück in die Datenbank.
