# TODO – Pitfall-Analyse (Stand: 2026-06-14)

---

## ❓ Offene Fragen – Bitte beantworten

> Diese Fragen entstammen der Code-Analyse und beeinflussen, ob Befunde als Bug oder als Design-Entscheidung eingestuft werden.

- [ ] **[FiscalController] Können täglicher Sync und Backfill parallel laufen?**
  - Kontext: Race Condition bei `getAuctionsByCusips`-Snapshot → doppeltes `treasury_auction_filled`-Event möglich.
  - Antwort: ___

- [ ] **[FiscalController] Ist `runTailBackfill` als dauerhafter Cron geplant oder einmaliger Backfill?**
  - Kontext: Wenn Yahoo beim Auktions-Sync ausfällt, bleibt der Tail dauerhaft NULL. Nur `runTailBackfill` kann das heilen.
  - Antwort: ___

- [ ] **[FiscalController] Wo soll `safeFloat()` definiert werden?**
  - Optionen: (a) Private Methode in `FiscalController`, (b) Shared Helper in `BaseController`, (c) Eigene Utility-Datei
  - Antwort: ___

- [ ] **[EventsController] Welcher Pacing-Wert ist korrekt: `sleepMs(100)` oder `sleepMs(15000)`?**
  - Kontext: `console.log('Warte 15 Sekunden')` vs. tatsächliches `sleepMs(100)` – 120× zu schnell für Alpha Vantage Free Tier.
  - Antwort: ___

- [ ] **[CboeController] Welches Datumsformat liefert das echte CBOE-CSV – `YYYY/MM/DD` oder `MM/DD/YYYY`?**
  - Kontext: Code geht von `YYYY/MM/DD` aus, Test-Mock liefert `MM/DD/YYYY`. Falsches Format → falsche Timestamps in DB.
  - Antwort: ___

- [ ] **[PolygonIoService] Enthält `response.next_url` bereits den API-Key?**
  - Kontext: Code hängt `&apiKey=...` manuell an. Bei künftiger Polygon-API-Änderung könnte der Key doppelt in der URL stehen.
  - Antwort: ___

- [ ] **[LLMService] Ist `maxRetries = 2` als "3 Versuche gesamt" oder "2 Versuche gesamt" gedacht?**
  - Kontext: `while (retryCount <= maxRetries)` läuft mit `maxRetries=2` exakt **3 Mal** (0, 1, 2). Test bestätigt 3 `sleepMs`-Aufrufe. Soll das so bleiben oder auf `<` korrigiert werden?
  - Antwort: ___

- [ ] **[SecService] Ist es akzeptabel, das Deckblatt (Cover Page) zu analysieren, wenn kein Exhibit 99 gefunden wird?**
  - Kontext: Bei 6-K/8-K ohne Exhibit 99 lädt `fetchFilingContent` das `primaryDocument` (oft Cover Page). Die LLM-Analyse bekommt dann ggf. irrelevanten Content ohne Warnung.
  - Antwort: ___

- [ ] **[QRAService] Soll `releaseDate` das tatsächliche Veröffentlichungsdatum des Artikels sein oder das Abrufdatum?**
  - Kontext: Aktuell ist `releaseDate = new Date().toISOString().split('T')[0]` (Abrufdatum). Bei Backfill oder verzögertem Job-Lauf wird ein falsches Datum gesetzt.
  - Antwort: ___

- [ ] **[QRAService] Soll bei RegEx-Parse-Fehler (Treasury ändert Formulierung) eine Push-Benachrichtigung via `NotificationService` ausgelöst werden?**
  - Kontext: Aktuell `console.warn` + `return null`. Kein Alert. Das Datum der nächsten QRA-Runde kann verpasst werden.
  - Antwort: ___

- [ ] **[MarketStatusService] Soll bei API-Fehler `false` statt `true` als Fallback zurückgegeben werden?**
  - Kontext: Aktueller Fallback `return true` lässt alle nachgelagerten Sync-Calls durch, auch wenn Polygon nicht erreichbar ist. Das kann das Tageslimit von AlphaVantage (25 Calls) und Finnhub aufbrauchen.
  - Antwort: ___

- [ ] **[AlphaVantageOptionService] Wird die Klasse als Singleton verwendet oder kann sie mehrfach instanziiert werden?**
  - Kontext: `callCounter` ist eine Instanz-Variable. Wenn der Controller mehrfach `new AlphaVantageOptionService()` aufruft, beginnt der Counter bei 0 – das 25-Calls-Tageslimit wird nicht korrekt eingehalten.
  - Antwort: ___

- [ ] **[OptionRepository] Soll `scraped_at` auf Minuten gerundet werden oder ist `contract_id` alleine als Conflict-Key für `insertAlphaVantageRatios` ausreichend?**
  - Kontext: `new Date().toISOString()` als Conflict-Key ist zu fein (Millisekunden-Granularität). Zwei Aufrufe innerhalb von 1ms erzeugen keinen Conflict – doppelte Zeilen sind möglich.
  - Antwort: ___

- [ ] **[SectorRotationController] Ist sichergestellt, dass `etfIndex` immer >= 70 ist, wenn `i >= 70` im SPY-Loop?**
  - Kontext: Der SPY-Loop beginnt bei `i = 70`. Der ETF-Index läuft nicht synchron zum SPY-Index. Wenn `etfIndex < 60`, greift `etfData[idxMinus60]` auf `undefined` zu → TypeError.
  - Antwort: ___

- [ ] **[LaborMarketController] Gibt es in FRED-Observations einen `preliminary`-Indikator oder muss `is_preliminary` manuell bestimmt werden?**
  - Kontext: Aktuell werden alle Delta-Sync-Daten als `is_preliminary = true` gespeichert, auch wenn FRED den Wert bereits final revisioniert hat.
  - Antwort: ___

---

## 🔴 Hoch – Sofortiger Handlungsbedarf

- [ ] **FinraController: Batch-Upserts einführen**
  - Datei: `src/controllers/FinraController.js`
  - Problem: Sequentieller Einzel-Upsert pro Zeile in `runSync` und `runBackfill`. FINRA-Dateien haben tausende Zeilen → extrem langsam.
  - Lösung: Zeilen sammeln und per Batch-Upsert an die DB senden.

- [ ] **CboeController: Batch-Upserts einführen**
  - Datei: `src/controllers/CboeController.js` (Zeile 46–57)
  - Problem: Sequentieller Einzel-Upsert pro Record via `await cboeRepo.upsertVolumeData()` in einer `for...of`-Schleife. `CboeRepository.upsertVolumeData()` macht je 1 Supabase-Call.
  - Lösung: Records sammeln und als Array-Batch mit einem einzigen `.upsert([...])` senden.

- [ ] **CboeController: Datumsformat-Parsing vs. CBOE-CSV prüfen**
  - Datei: `src/controllers/CboeController.js` (Zeile 47–49)
  - Problem: Code splittet `record['Trade Date']` per `/` und nutzt Index 0 als Jahr (`Date.UTC(dateParts[0], ...)`). Das setzt Format `YYYY/MM/DD` voraus.
    Der Test-Mock in `CboeController.test.js` (Zeile 51) liefert aber `'06/08/2026'` – also `MM/DD/YYYY`.
    Wenn das echte CBOE-CSV `MM/DD/YYYY` liefert, erzeugt der Code **völlig falsche Timestamps** (Jahr=6, Tag=2026 → Date-Overflow).
  - Klärung: Echtes CBOE-CSV-Format prüfen und Code oder Test korrigieren.

- [ ] **FredController: Null-Pointer absichern**
  - Datei: `src/controllers/FredController.js` (Zeile ~28)
  - Problem: `this.pacingManager.sleepMs(1000)` ohne Null-Check. `BaseController.delay()` prüft auf null, hier wird direkt zugegriffen.
  - Lösung: `this.delay()` aus BaseController nutzen oder Null-Guard einbauen.

- [ ] **PolygonIoService: Endlosschleife bei anhaltendem 429 in `fetchHistoricalData`**
  - Datei: `src/services/PolygonIoService.js` (Zeile 54–56)
  - Problem: Bei 429 wartet der Code 65s und geht dann zurück in die `while(currentUrl)`-Schleife mit **demselben `currentUrl`**. Kein Retry-Counter, kein Max-Retries. Bei dauerhaftem Rate-Limit: **Endlosschleife**.
  - Lösung: Retry-Counter einführen (z.B. max 3 Retries) und danach den Fehler werfen.

- [ ] **PolygonIoService: Rekursiver Retry ohne Tiefenlimit in `fetchOptionsContractBars`**
  - Datei: `src/services/PolygonIoService.js` (Zeile 109)
  - Problem: Bei 429: `return this.fetchOptionsContractBars(...)` – rekursiver Self-Call ohne Zähler. Bei anhaltendem Rate-Limit: **Stack Overflow**.
  - Lösung: Iterativen Retry mit Zähler verwenden.

- [ ] **EventsController: Delete-before-Upsert – Datenverlust bei Upsert-Fehler**
  - Datei: `src/controllers/EventsController.js` (Zeile 87–91)
  - Problem: Z. 87 löscht alle zukünftigen Events via `deleteUpcomingEvents()`, Z. 91 schreibt die neuen via `upsertEvents()`.
    Wenn der Upsert fehlschlägt (DB-Timeout, Supabase-Error), sind **alle zukünftigen Events gelöscht** und die neuen nicht geschrieben.
    Events werden für Scoring und Alerts genutzt → Datenverlust bis zum nächsten erfolgreichen Sync.
  - Lösung: Upsert zuerst, dann Delete der alten – oder beides in einer Transaktion.

- [ ] **FiscalController: Race Condition – Doppeltes Event bei parallelen Läufen**
  - Datei: `src/controllers/FiscalController.js` (Zeile 27–107)
  - Problem: `getAuctionsByCusips()` liest den DB-Zustand **vor** dem `processItemsSafely`-Loop (Snapshot). Wenn parallel ein zweiter Prozess (z.B. Backfill) dieselbe Auktion füllt, erkennt der erste Prozess `wasEmptyBefore=true` und feuert erneut das `treasury_auction_filled`-Event → **Doppel-Event bei parallelen Sync-Läufen**.
  - Lösung: Pre-Check in den Item-Loop verschieben (direkt vor `upsertAuctionData`), oder optimistic-locking über `onConflict`-Check.

- [ ] **FiscalController: `parseFloat()` ohne NaN-Check auf Treasury-API-Feldern**
  - Datei: `src/controllers/FiscalController.js` (Zeile 44–52)
  - Problem: Treasury API liefert alle Zahlenfelder als Strings. Leere Strings (`""`) → `parseFloat("") = NaN` → NaN wird in die DB geschrieben.
    Betroffen: `bid_to_cover_ratio`, `high_yield`, `offering_amount`, `total_tendered`, `total_accepted`, `primary_dealer_accepted`, `direct_bidder_accepted`, `indirect_bidder_accepted`.
  - Lösung: Hilfsfunktion `const safeFloat = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; }` verwenden.

- [ ] **FiscalController: Nicht-atomare Tail-Berechnung – Tail bleibt dauerhaft leer bei Yahoo-Fehler**
  - Datei: `src/controllers/FiscalController.js` (Zeile 79–90)
  - Problem: Ablauf: 1) `upsertAuctionData` → 2) Yahoo-Call `fetchYieldForDate` → 3) `updateAuctionTail`. Wenn Schritt 2 fehlschlägt oder `null` liefert, ist `total_accepted` danach gesetzt – der nächste Lauf erkennt `wasEmptyBefore=false` und überspringt die Tail-Berechnung komplett. Tail bleibt **dauerhaft NULL** ohne Fehlermeldung.
  - Lösung: `runTailBackfill` als Recovery explizit planen, oder Yahoo-Fehler als Warnung loggen und CUSIP auf eine Retry-Liste setzen.

- [ ] **PolygonIoService: `onChunkReceived`-Fehler bricht Paginierung ab – dauerhafter Candle-Gap**
  - Datei: `src/services/PolygonIoService.js` (Zeile 36–61)
  - Problem: Wenn der `onChunkReceived`-Callback (z.B. `upsertM5Candles` oder `upsertDailyCandles`) eine Exception wirft, landet der Code im `catch`-Block (Z. 53). Dort wird auf Status 429 geprüft. Ein DB-Fehler hat kein `error.response` → Else-Branch → `throw`. Die Paginierung bricht ab, alle folgenden Seiten werden **nie abgerufen**. Da der Timestamp-Fortschritt ggf. bereits über vorherige erfolgreiche Chunks in der DB steht, erkennt der nächste Sync den Zeitraum als bereits verarbeitet → **dauerhafter Daten-Gap**.
  - Lösung: `onChunkReceived`-Aufruf in einen separaten `try/catch` wrappen, der von Netzwerkfehlern unterschieden wird. Alternativ: eigene `ChunkProcessingError`-Klasse.

- [ ] **FinraService: Fehlercode-Prüfung per String-Match – fragil und produziert stille Datenburgäcken**
  - Datei: `src/services/FinraService.js` (Zeile 103)
  - Problem: `error.message.includes('403') || error.message.includes('404')` prüft den HTTP-Status als String im Error-Message. Das ist ein undokumentiertes Implementierungsdetail von `ky`. Bei Formatierungen des Fehler-Textes ohne Statuscode im String (z.B. eigene Proxy-Fehlermeldungen) gibt `downloadFileContent` `null` zurück statt zu werfen – der Tag wird dann als „kein Handelstag“ interpretiert, obwohl ein echter Netzwerkfehler vorliegt → **stille Datenburgäcken**.
  - Lösung: `error.response?.status` auswerten: `if ([403, 404].includes(error.response?.status)) return null;`

- [ ] **FinraRepository: `getExistingMonths` lädt ALLE Timestamps ohne Limit – Memory/Performance-Problem**
  - Datei: `src/repositories/FinraRepository.js` (Zeile 71–74)
  - Problem: `.select('timestamp').order('timestamp', ...)` ohne `.limit()`. Bei einer großen FINRA-Tabelle (viele Ticker × Jahre × täglich = Hunderttausende Zeilen) wird die gesamte Tabelle in den Node.js-Prozess geladen, nur um ein Set von Monatsstrings aufzubauen. Kann zu **Out-of-Memory oder Timeouts** führen.
  - Lösung: DB-seitig aggregieren via Supabase-RPC oder `DISTINCT ON (date_trunc('month', to_timestamp(timestamp)))`, um nur eindeutige Monate zu laden.

- [ ] **LLMService: `_queryGroq` gibt `null` zurück bei Nicht-429-Fehlern – stilles Scheitern**
  - Datei: `src/services/LLMService.js` (Zeile 76–79)
  - Problem: Jeder Fehler außer 429/502/503 (z.B. 401 Auth-Fehler, JSON-Parse-Fehler, Netzwerkunterbrechung) führt zu `return null` statt `throw`. Alle Caller (`parseQraArticle`, `analyzeSecSnippet`, `analyzeMacroEvent`, `parseQraConsensus`) erhalten `null` ohne jede Fehlermeldung auf ihrer Ebene. `null` kann anschließend in die DB geschrieben werden oder als valides Ergebnis interpretiert werden.
  - Lösung: Nicht-429-Fehler ebenfalls werfen und jeden Caller mit explizitem `null`-Check absichern.

- [ ] **SentimentNewsService: Kein Pacing zwischen Ticker-Requests – Finnhub Rate Limit (Z. 85)**
  - Datei: `src/services/SentimentNewsService.js` (Zeile 72–85)
  - Problem: `fetchSentiments` loopt über alle Ticker ohne Sleep zwischen den `ky.get()`-Aufrufen. Finnhub Free Tier: 60 Calls/Minute. Bei genügend Tickern werden Requests zu schnell gesendet → 429-Fehler → Exception → **alle bisherigen Teilergebnisse im Speicher gehen verloren** (kein Partial-Save). Kein `retry` konfiguriert.
  - Lösung: `pacingManager.sleepMs()` zwischen Ticker-Calls einbauen; `retry`-Option auf `ky.get()` setzen.

- [ ] **SecRepository: `fmpFundamentalExists` – DB-Fehler wird als `false` interpretiert**
  - Datei: `src/repositories/SecRepository.js` (Zeile 118)
  - Problem: `if (error) return false;` interpretiert jeden DB-Fehler (Netzwerkausfall, Tabelle nicht erreichbar) stillschweigend als "Datensatz existiert nicht". Der Caller geht davon aus, dass er sicher inserieren kann – und läuft in einen Unique-Constraint-Fehler oder schreibt einen Duplikat. Einzige Stelle im Repository mit diesem Anti-Pattern; alle anderen Methoden werfen korrekt.
  - Lösung: `throw new Error(\`Fehler bei Prüfung auf FMP-Fundamentals: ${error.message}\`)` wie alle anderen Methoden.

- [ ] **SecRepository: `saveRawFiling` / `saveAiSignals` – `insert` statt `upsert` bei nicht-atomarer Prüfung**
  - Datei: `src/repositories/SecRepository.js` (Zeile 88–98, 141–143)
  - Problem: `filingExists()` (Call 1) + `saveRawFiling()` (Call 2) sind nicht atomar. Bei Wiederholung des Jobs (nach Fehler oder Doppeltrigger) sieht die zweite Ausführung `filingExists=false` (weil Prüfung und Insert unabhängig sind) und führt erneut einen Insert durch → Unique-Constraint-Fehler. Gleiches gilt für `saveAiSignals` ohne Prüfung.
  - Lösung: `.upsert([...], { onConflict: 'accession_number' })` statt `.insert()` für Idempotenz.

- [ ] **QRAService: Quartal-Berechnung nutzt lokale Zeitzone (Z. 62–64)**
  - Datei: `src/services/QRAService.js` (Zeile 62–71)
  - Problem: `new Date()` + `getMonth()` (lokal). Auf Servern in UTC-5 oder UTC+9 kann kurz nach Mitternacht der falsche Monat (und damit das falsche Quartal) ermittelt werden → QRA-Daten werden einem falschen Quartal zugeordnet.
  - Lösung: `now.getUTCMonth()` wie in `FinraService` (Z. 61).

- [ ] **MarketStatusService: Fallback `return true` bei Netzwerkfehler – kann Tageslimits verbrauchen**
  - Datei: `src/services/MarketStatusService.js` (Zeile 21)
  - Problem: Bei Polygon-Netzwerkfehler gibt `isMarketOpen()` `true` zurück. Alle nachgelagerten Sync-Prozesse (AlphaVantage 25 Calls/Tag, Finnhub 60/Min, etc.) werden angetriggert, obwohl der Markt möglicherweise geschlossen ist oder die API nicht erreichbar war. In GitHub Actions ohne stabile Netzverbindung kann das Tageslimits aufbrauchen.
  - Klärung: Ist der Fallback absichtlich so gesetzt?

- [ ] **AlphaVantageOptionService: API-Key direkt in URL-String – Key-Leaking in Logs (Z. 70, 114)**
  - Datei: `src/services/AlphaVantageOptionService.js` (Zeile 70, 114)
  - Problem: `\`query?function=...&apikey=${this.apiKey}\`` – der Key ist Teil des URL-Strings, nicht als `searchParams` gesetzt. Landet in ky-Error-Messages und potenziell in GitHub Actions-Logs.
  - Lösung: `this.api.get('query', { searchParams: { function: ..., apikey: this.apiKey } })`

- [ ] **FinnhubService: `prefix` statt `prefixUrl` in `ky.create()` – alle API-Calls schlagen lautlos fehl**
  - Datei: `src/services/FinnhubService.js` (Zeile 17)
  - Problem: `ky.create({ prefix: '...' })` – `ky` kennt keine `prefix`-Option. Der korrekte Key ist `prefixUrl`. Mit dem falschen Key wird die Basis-URL still ignoriert → alle `this.api.get(endpoint)` Calls nutzen relative Pfade ohne Host → Netzwerkfehler. Sämtliche Kalender-Daten (Earnings, FDA) können nicht abgerufen werden.
  - Lösung: `prefix` → `prefixUrl` korrigieren.

- [ ] **FiscalService: `fetchAuctions` gibt `response.data` ohne Null-Check zurück (Z. 28)**
  - Datei: `src/services/FiscalService.js` (Zeile 28)
  - Problem: `return response.data;` – wenn die Treasury API `{ meta: {...} }` ohne `data`-Property antwortet (leeres Ergebnis), wird `undefined` zurückgegeben. Der FiscalController iteriert dann über `undefined` → **TypeError: `undefined` is not iterable**.
  - Lösung: `return response.data || [];`

- [ ] **ArchiveRepository: Globaler Import von `archiveSupabaseClient` – kein DI, kein Fehler-Guard**
  - Datei: `src/repositories/ArchiveRepository.js` (Zeile 1, 7)
  - Problem: `archiveSupabaseClient` wird als Modul-Level-Singleton importiert und direkt ohne Null-Check verwendet. Wenn `ArchiveSupabaseClient.js` beim Import wirft (fehlende Env-Vars), bricht das gesamte Modul. Alle anderen Repositories nutzen DI. Unit-Tests müssen das gesamte Modul mocken statt einfach DI zu nutzen.
  - Lösung: `constructor(supabaseClient = archiveSupabaseClient)` als optionalen DI-Parameter ergänzen.

- [ ] **QRAController: `runSync()` – Monat-Check nutzt lokale Zeitzone (Z. 55)**
  - Datei: `src/controllers/QRAController.js` (Zeile 55)
  - Problem: `now.getMonth() + 1` ist lokal. Auf einem Server in UTC+2 kann nahe Mitternacht der falsche Monat ermittelt werden → QRA-Sync läuft nicht oder läuft außerplanmäßig.
  - Lösung: `now.getUTCMonth() + 1`

- [ ] **QRAController: `runConsensusSync()` – `ky.get(rssUrl)` ohne Timeout, Retry, Error-Handling (Z. 211)**
  - Datei: `src/controllers/QRAController.js` (Zeile 211)
  - Problem: Kein `try/catch`, kein Timeout, kein Retry. Google News RSS ist ein externer Dienst – schlägt er fehl, endet der Job mit einer unbehandelten Exception.
  - Lösung: `ky.get(rssUrl, { timeout: 30000, retry: { limit: 2 } })` + try/catch.

- [ ] **SecController: `runMasterSync()` – `yahooFinance` direkt importiert, nicht per DI (Z. 4, 122)**
  - Datei: `src/controllers/SecController.js` (Zeile 4, 122)
  - Problem: `yahoo-finance2` wird als Modul-Level-Import direkt genutzt, nicht als DI-Parameter. Fehler bei Rate-Limiting treffen den Controller direkt. Yahoo-Fehler werden per `console.error` abgefangen, aber die Firma wird danach trotzdem mit SEC-Parsing fortgesetzt – ohne FMP-Fundamentals.

- [ ] **SectorRotationController: Array-Index-Zugriff ohne vollständigen Guard (Z. 118–126)**
  - Datei: `src/controllers/SectorRotationController.js` (Zeile 118–126)
  - Problem: `etfData[idxMinus60]` und `etfData[idxMinus20]` können `undefined` sein, wenn der ETF-Index nicht synchron zum SPY-Index läuft. Der Guard `if (etfIndex < 70) continue` schützt nur teilweise.
  - Klärung: Ist sichergestellt, dass `etfIndex` immer ≥ 70 ist, wenn `i >= 70`?

---

## 🟠 Mittel – Sollte zeitnah behoben werden

- [ ] **PolygonIoService: `console.warn` statt Throw bei fehlendem API-Key**
  - Datei: `src/services/PolygonIoService.js` (Zeile 12)
  - Problem: Identisches Muster wie `ArchiveSupabaseClient`: Warnung statt Hard-Fail. Service wird ohne API-Key erstellt → kryptischer Fehler erst bei API-Call.
  - Lösung: `throw new Error(...)` statt `console.warn`.

- [ ] **PolygonIoService: API-Key kann in Fehlermeldungen/Logs auftauchen**
  - Datei: `src/services/PolygonIoService.js` (Zeile 32, 58)
  - Problem: API-Key wird als Query-Param in die URL eingebettet. Bei Fehlern wird `error.message` geloggt, was die URL (inkl. Key) enthalten kann.
  - Lösung: Fehler-Logging so anpassen, dass der API-Key maskiert wird.

- [ ] **PolygonIoService: Eigener pacingManager statt globaler**
  - Datei: `src/services/PolygonIoService.js` (Zeile 8)
  - Problem: Service erstellt seinen eigenen `createPacingManager()` als Default. Getrennt vom globalen PacingManager in der ControllerRegistry. Zwei unabhängige Pacing-Instanzen, die sich nicht koordinieren.

- [ ] **CboeService: Keine Retry-Logik bei Scraping**
  - Datei: `src/services/CboeService.js` (Zeile 6–15)
  - Problem: `ky.create()` ohne `retry`-Option. CBOE-Scraping ist fragil – Rate-Limits (429) schlagen direkt fehl.
  - Lösung: `retry: { limit: 3, methods: ['get'] }` konfigurieren.

- [ ] **CboeController: Fehlende Test-Coverage**
  - Datei: `tests/controllers/CboeController.test.js`
  - Fehlende Tests: Leere CSV-Response (`[]`), ungültiges Datumsformat (`dateParts.length !== 3`), Controller mit pacingManager (Prod-Pfad).

- [ ] **EventsController: Kommentar/Code-Mismatch bei Alpha Vantage Pacing**
  - Datei: `src/controllers/EventsController.js` (Zeile 160–161)
  - Problem: `console.log('Warte 15 Sekunden')` aber Code macht `sleepMs(100)` (100ms).
    Alpha Vantage Free Tier hat 5 Calls/Minute. Bei 100ms Pause = ~600 Calls/Minute → **120× zu schnell**.
    Entweder ist `sleepMs(15000)` korrekt oder das Limit wurde aufgehoben.
  - Klärung: Welcher Wert ist korrekt?

- [ ] **EventsController: `runBackfill` liest API-Key direkt aus `process.env`**
  - Datei: `src/controllers/EventsController.js` (Zeile 103, 125)
  - Problem: `const apiKey = process.env.ALPHAVANTAGE_API_KEY` – Key wird als Query-Param in die URL eingebettet.
    Inkonsistenz: `runDailySync` nutzt den injizierten `finnhubService`, aber `runBackfill` baut eigene URLs mit Key aus `process.env`.
    Key kann in Fehler-Logs auftauchen.

- [ ] **EventsController: `httpClient` ohne Alpha-Vantage-Abstraktion genutzt**
  - Datei: `src/controllers/EventsController.js` (Zeile 126)
  - Problem: `this.httpClient.get(path).json()` – roher ky-Call. Rate-Limit-Erkennung (`data["Note"]`, `data["Information"]`) liegt im Controller statt im Service.
    Bei API-Änderung muss der Controller geändert werden statt nur der Service.
  - Lösung: Eigenen `AlphaVantageEarningsService` extrahieren.

- [ ] **FinnhubService: `console.warn` statt Throw bei fehlendem API-Key**
  - Datei: `src/services/FinnhubService.js` (Zeile 11–12)
  - Problem: Identisches Muster wie PolygonIoService und ArchiveSupabaseClient. API-Token in Query-Params (Z. 32) → Key-Leaking möglich bei Fehler-Logging.
  - Lösung: `throw new Error(...)` statt `console.warn`.

- [ ] **EventRepository: Konstruktor-Validierung als Pattern für alle Repositories**
  - Datei: `src/repositories/EventRepository.js` (Zeile 9)
  - Info: Einziges Repository mit `if (!supabaseClient) throw new Error(...)` im Konstruktor. Vorbildlich!
    Alle anderen Repositories vermissen diese Prüfung – sollte als Pattern übernommen werden.

- [ ] **BaseController: "✅ Beendet"-Log nur bei Erfolg**
  - Datei: `src/core/BaseController.js` (Zeile ~24)
  - Problem: `finally`-Block loggt immer "✅ Beendet" – auch bei Fehlern. Irreführend.
  - Lösung: Log in den `try`-Block verschieben (nach `await logicCallback()`).

- [ ] **ArchiveController: Nicht-atomare 3-Schritt-Kette absichern**
  - Datei: `src/controllers/ArchiveController.js` (Zeile 64–94)
  - Problem: Schritt 1 (Upsert Archiv) → Schritt 2 (Log-Update) → Schritt 3 (Delete Original) ohne Transaktion.
    Fehler bei Schritt 2/3 wird von `processItemsSafely` geschluckt → Daten im Archiv, aber Log falsch und/oder Originale nicht gelöscht.
    Nächster Lauf archiviert dieselben Daten erneut (Upsert = harmlos, aber Verschwendung).
  - Lösung: Transaktion oder Compensating-Logik einbauen.

- [ ] **ArchiveRepository: Hartverdrahteter Client statt DI**
  - Datei: `src/repositories/ArchiveRepository.js` (Zeile 1)
  - Problem: Importiert `archiveSupabaseClient` direkt als Modul-Singleton. Controller bekommt `supabaseClient` als DI, aber ArchiveRepository ignoriert DI komplett.
  - Auswirkung: Repository in Tests nur mockbar, weil das gesamte Objekt gemockt wird – nicht weil DI greift.

- [ ] **ArchiveRepository: Kein expliziter `onConflict`-Key**
  - Datei: `src/repositories/ArchiveRepository.js` (Zeile 7–9)
  - Problem: `.upsert(candles)` ohne `onConflict`-Angabe. Supabase nutzt den Primary Key der Tabelle. Falls Archiv-Tabelle anderen PK hat: stille Duplikate.

- [ ] **ArchiveSupabaseClient: `console.warn` statt Hard-Fail bei fehlenden Credentials**
  - Datei: `src/core/ArchiveSupabaseClient.js` (Zeile 7–9)
  - Problem: Fehlende Env-Variablen erzeugen nur eine Warnung. `createClient('https://undefined.supabase.co', undefined)` → kryptischer Fehler erst beim DB-Aufruf statt klarer Meldung.
  - Lösung: `throw new Error(...)` statt `console.warn`.

- [ ] **RegulationController: `processItemsSafely` verwenden**
  - Datei: `src/controllers/RegulationController.js`
  - Problem: Roher `for`-Loop statt `processItemsSafely`. Unerwartete Fehler stoppen die gesamte Verarbeitung.
  - Zusätzlich: JSDoc sagt `aiClient`, Parameter heißt `llmService`.

- [ ] **SentimentNewsController: `processItemsSafely` verwenden**
  - Datei: `src/controllers/SentimentNewsController.js`
  - Problem: Rohe `for`-Loops. Stilles Fehler-Schlucken in inneren Upsert-Loops (nicht geloggt, nur gezählt).

- [ ] **RegulationController: Reihenfolge Ratio/Document-Insert**
  - Datei: `src/controllers/RegulationController.js` (Zeile ~96–104)
  - Problem: Ratio-Insert vor Document-Insert. Bei Fehler beim Document-Insert bleibt Ratio inkonsistent.

- [ ] **parseFloat() ohne NaN-Check**
  - Dateien: `src/controllers/GlobalMacroController.js`, `src/controllers/LaborMarketController.js`
  - Problem: `parseFloat(obs.value)` könnte `NaN` in die DB schreiben bei nicht-numerischen Werten.
  - Lösung: NaN-Guard einbauen (`const val = parseFloat(x); if (isNaN(val)) ...`).

- [ ] **EventBus als Constructor-Dependency injizieren**
  - Dateien: `FiscalController`, `FredController`, `GlobalMacroController`, `LaborMarketController`, `QRAController`
  - Problem: Dynamischer `await import('./EventBus.js')` bei jedem Aufruf statt DI.
  - Lösung: EventBus über ControllerRegistry injizieren.

- [ ] **FiscalService: Keine Pagination – stilles Truncation beim Backfill**
  - Datei: `src/services/FiscalService.js` (Zeile 19–32)
  - Problem: `fetchAuctions()` macht genau **einen** API-Call mit `page[size]: limit`. Wenn die realen Daten > `BACKFILL_LIMIT` (aktuell 2000), werden überschüssige Datensätze **still abgeschnitten** – kein Warning, kein Paging-Loop.
  - Klärung: Prüfen, ob die Treasury API über 2000 Auktionsdatensätze pro Typ hat. Falls ja: Pagination über `page[number]` implementieren.

- [ ] **FiscalService: Kein Retry bei Netzwerkfehlern**
  - Datei: `src/services/FiscalService.js` (Zeile 27)
  - Problem: `ky.get()` ohne `retry`-Option. Treasury-API-Timeouts oder transiente Fehler schlagen sofort als Exception durch.
  - Lösung: `retry: { limit: 2, methods: ['get'] }` in den `ky.get()`-Call einfügen.

- [ ] **FiscalRepository: 14 Positional Parameters in `upsertAuctionData` sind fehleranfällig**
  - Datei: `src/repositories/FiscalRepository.js` (Zeile 25–66)
  - Problem: Die Funktion `upsertAuctionData` hat 14 positionale Parameter. Ein Fehler in der Reihenfolge am Caller ist schwer zu debuggen und produziert keine Compile-Zeit-Warnung.
  - Lösung: Umstellen auf ein einzelnes Options-Objekt: `upsertAuctionData({ auctionDate, issueDate, ... })`.

- [ ] **FiscalController: `createYahooService()` ad-hoc instantiiert statt via DI**
  - Datei: `src/controllers/FiscalController.js` (Zeile 19, 178)
  - Problem: `createYahooService()` wird bei jedem Aufruf von `_processAuctions` und `runTailBackfill` neu erzeugt – nicht via DI injiziert. Inkonsistent zu anderen Controllern, erschwert das Unit-Testing (Modul-Mock statt DI nötig).
  - Lösung: `yahooService` als Constructor-Parameter übergeben.

- [ ] **FinraController: Duplizierte Parsing-Logik extrahieren**
  - Datei: `src/controllers/FinraController.js`
  - Problem: Identische File-Content-Parsing-Logik in `runSync` und `runBackfill`.
  - Lösung: Private Methode `_parseFinraFile()` extrahieren.

- [ ] **GlobalMacroController: Code-Duplikation reduzieren**
  - Datei: `src/controllers/GlobalMacroController.js`
  - Problem: `runDailySync` und `runBackfill` haben nahezu identische Loops.
  - Lösung: Shared private Methode extrahieren.

- [ ] **ClimaxController: Timestamp-Alignment zwischen Datenquellen fehlt**
  - Datei: `src/controllers/ClimaxController.js` (Zeile 70–77)
  - Problem: FINRA-, CBOE- und Candle-Daten werden als separate Arrays (per Index) an `SellingClimaxScorer.calculateScore()` übergeben. Die Arrays werden nur per `.map()` erzeugt, ohne die Timestamps aneinander auszurichten. Wenn z.B. FINRA 20 Tage und Candles 25 Tage haben, werden falsche Datenpunkte zueinander in Beziehung gesetzt → **falsches Scoring-Ergebnis**.
  - Lösung: Daten per Timestamp joinen oder den Scorer so anpassen, dass er Timestamp-keyed arbeitet.

- [ ] **ClimaxController: `getAllTickers()` statt job-gefilterter Liste**
  - Datei: `src/controllers/ClimaxController.js` (Zeile 22)
  - Problem: Scannt alle Ticker in der DB. Für Ticker ohne FINRA/CBOE-Daten werden 3 unnötige DB-Queries gemacht. Alle anderen Controller nutzen `getTickersForJob(SYNC_JOBS.xxx)`.
  - Lösung: `SYNC_JOBS.CLIMAX` einführen oder vorhandenen Filter nutzen.

- [ ] **EventBus: Race Condition bei parallelen emit()-Aufrufen**
  - Datei: `src/core/EventBus.js`
  - Problem: `readFileSync` → `JSON.parse` → `push` → `writeFileSync`. Wenn zwei Controller parallel `emit()` aufrufen, kann der zweite Write den ersten überschreiben → **Event-Verlust**.
  - Zusätzlich: Synchrones File-I/O blockiert den Event-Loop. `process.cwd()` für Pfad ist fragil.
  - Lösung: Append-Modus (JSONL statt JSON-Array), oder Queue-basierter Ansatz.

- [ ] **OptionsController: Deduplizierungs-Logik vereinheitlichen**
  - Datei: `src/controllers/OptionsController.js`
  - Problem: Identisches `uniqueAnomalies`/`seenContracts`-Pattern in `runHistoricSync` und `runBackfillSync`.
  - Lösung: Helper-Methode extrahieren.

- [ ] **FRED-Services: Dreifache Codeduplizierung + inkonsistente Robustheit**
  - Dateien: `src/services/FredService.js` · `src/services/GlobalMacroService.js` · `src/services/LaborMarketService.js`
  - Problem: Alle drei rufen dieselbe FRED-API ab, aber nur `FredService` hat `timeout: 30000` und `retry: { limit: 3 }` konfiguriert. `GlobalMacroService` (Z. 26) und `LaborMarketService` (Z. 19) fehlen beide Optionen → bei Netzwerkproblemen kein Retry, kein Timeout-Schutz. Außerdem dreifach duplizierte Implementierung.
  - Lösung: Gemeinsame `createFredApiClient(apiKey, options)`-Factory extrahieren, die alle drei Services nutzen.

- [ ] **GlobalMacroService + LaborMarketService: API-Key-Prüfung erst zur Laufzeit**
  - Dateien: `src/services/GlobalMacroService.js` (Z. 4, 13) · `src/services/LaborMarketService.js` (Z. 4, 8)
  - Problem: `FRED_API_KEY` wird beim Modul-Import als Closure gelesen. Die Prüfung `if (!FRED_API_KEY) throw` erfolgt erst beim ersten `fetchSeriesData()`-Aufruf – nicht beim Erstellen des Service-Objekts. `FredService` macht das richtig (Prüfung direkt in `createFredService()`). Inkonsistentes Verhalten und spät entdeckte Fehlkonfiguration.
  - Lösung: Key-Prüfung in den `createXxxService()`-Factory-Body verschieben (wie in FredService).

- [ ] **FRED-Services: API-Key in Query-Params → potenziell in Fehler-Logs**
  - Dateien: `src/services/FredService.js` (Z. 28, 49) · `src/services/GlobalMacroService.js` (Z. 19, 29) · `src/services/LaborMarketService.js` (Z. 12, 22)
  - Problem: `api_key` wird als Query-Parameter übergeben. Bei HTTP-Fehlern kann `ky` die URL in `error.message` einbetten → FRED API-Key erscheint im Log. Gleiches Muster wie bei PolygonIoService und FinnhubService.
  - Lösung: Fehler-Logging so anpassen, dass der Key maskiert wird (z.B. `error.message.replace(apiKey, '***')`).

- [ ] **FredRepository: `upsertMacroData` – 7 Positional Parameters**
  - Datei: `src/repositories/FredRepository.js` (Z. 20)
  - Problem: Sieben positionale Parameter (`observationDate, tgaBalance, rrpBalance, fedBalance, btfpBalance, bankReservesFed, sofrRate`). Falsche Reihenfolge am Caller schreibt stillen Datenmüll in die DB (kein Compile-Fehler, kein Typ-Check). Gleiches Anti-Pattern wie `FiscalRepository.upsertAuctionData`.
  - Lösung: Options-Objekt verwenden: `upsertMacroData({ observationDate, tgaBalance, ... })`.

- [ ] **GlobalMacroRepository: `getDefinitions` ohne Null-Guard**
  - Datei: `src/repositories/GlobalMacroRepository.js` (Z. 20)
  - Problem: `return data;` ohne `|| []`. Wenn Supabase `data: null` zurückgibt (leere Tabelle bei manchen Treiber-Versionen), returned die Funktion `null`. Der Aufrufer iteriert mit `for...of` → **TypeError: null is not iterable**.
  - Lösung: `return data || [];`

- [ ] **DailyController: Kein `getArchivedUntilTimestamp`-Fallback**
  - Datei: `src/controllers/DailyController.js` (Zeile 34–35)
  - Problem: M5Controller prüft (Z. 35–41) ob ein Archiv-Log existiert und nutzt `archivedUntil` als Sync-Startpunkt wenn die Live-Tabelle leer ist. DailyController fehlt diese Logik vollständig. Wenn Daily-Candles archiviert wurden und die `market_daily_candles`-Tabelle geleert ist, startet DailyController einen unnötigen 2-Jahres-Backfill statt ab dem Archiv-Datum fortzusetzen.
  - Lösung: Gleiche `archivedUntil`-Logik wie in M5Controller übernehmen.

- [ ] **PolygonIoService: API-Key in `next_url` potenziell doppelt angehangen**
  - Datei: `src/services/PolygonIoService.js` (Zeile 45–46)
  - Problem: `response.next_url` kommt von Polygon. Der Code hängt manuell `&apiKey=${this.apiKey}` an. Falls Polygon künftig den Key bereits in `next_url` einbettet (möglich bei API-Versionswechsel), steht der Key **doppelt** in der URL → potenziell invalide Anfrage oder versehentliches Key-Leaking im Log.
  - Klärung: Polygon-Doku prüfen. Ggf. Key-Prüfung und bedingtes Anhängen einbauen.

- [ ] **PolygonIoService: `fetchOptionsContractBars` – Nicht-429-Fehler wird als `[]` zurückgegeben (stilles Scheitern)**
  - Datei: `src/services/PolygonIoService.js` (Zeile 111–112)
  - Problem: Nicht-429-Fehler werden geloggt und als leeres Array `[]` zurückgegeben. Der Aufrufer (OptionsController) kann nicht unterscheiden ob „keine Handelsdaten vorhanden“ oder „API-Fehler aufgetreten“. Scoring auf Basis leerer Daten produziert stille Fehlresultate.
  - Lösung: Fehler werfen statt `[]` – oder einen Fehlerindikator im Rückgabetyp ergänzen.

- [ ] **LLMService: `_queryGroq` Retry-Zähler Off-by-One – 3 statt 2 Retries**
  - Datei: `src/services/LLMService.js` (Zeile 27–29)
  - Problem: `while (retryCount <= maxRetries)` mit `maxRetries = 2` läuft **3 Mal** (retryCount 0, 1, 2). Der Kommentar impliziert "2 Retries", der Code macht aber 3 Versuche gesamt. Der LLMService.test.js bestätigt unbeabsichtigt `toHaveBeenCalledTimes(3)`. Falls `maxRetries` erhöht wird, potenziert sich der Off-by-One-Effekt.
  - Klärung: Ist 3 Versuche (1 initial + 2 Retries) Absicht? Wenn nicht: `<` statt `<=` oder Kommentar korrigieren.

- [ ] **LLMService: Groq API-Key in Auth-Header – potenziell in Fehler-Logs sichtbar**
  - Datei: `src/services/LLMService.js` (Zeile 32–34, 77)
  - Problem: `'Authorization': \`Bearer ${this.GROQ_API_KEY}\`` als Request-Header. `console.error` auf Z. 77 loggt `error.message`, der bei manchen ky-Versionen Request-Details enthalten kann. Zusätzlich: `this.GROQ_API_KEY` wird direkt aus `process.env` gelesen statt per DI übergeben – erschwerert Unit-Tests.
  - Lösung: Key-Maskierung im Error-Logging; Key als Constructor-Parameter anbieten.

- [ ] **SentimentNewsService: Finnhub API-Token in Query-Params – Key-Leaking**
  - Datei: `src/services/SentimentNewsService.js` (Zeile 29, 80)
  - Problem: `token: apiKey` als `searchParams` → Key landet in der URL → bei HTTP-Fehler in `error.message` sichtbar. Gleiches Muster wie PolygonIo/FRED-Services.
  - Lösung: Key in Fehler-Logs maskieren.

- [ ] **NotificationService: `_sendNtfySh` schluckt Fehler – Caller erhält kein Feedback**
  - Datei: `src/services/NotificationService.js` (Zeile 42–44)
  - Problem: `catch`-Block loggt nur und gibt `undefined` zurück. Kein `throw`, kein Rückgabewert. Der Alert-Controller weiß nicht ob die Benachrichtigung angekommen ist. Bei Netzwerkproblemen fehlt ein kritischer Alert lautlos.
  - Lösung: Fehler weiterwerfen oder boolean-Erfolgsindikator zurückgeben.

- [ ] **SentimentNewsRepository: `getLatestNewsDate` – `split('T')[0]` ohne Null-Check**
  - Datei: `src/repositories/SentimentNewsRepository.js` (Zeile 82)
  - Problem: `data[0].published_at.split('T')[0]` wirft **TypeError** wenn `published_at` `null` oder `undefined` ist (ungültiger DB-Eintrag).
  - Lösung: `data[0].published_at?.split('T')[0] ?? null`

- [ ] **QRARepository: `saveQraConsensus` – nicht-atomare Read-Modify-Write-Sequenz**
  - Datei: `src/repositories/QRARepository.js` (Zeile 85–102)
  - Problem: `getLatestEstimateForQuarter()` (Read) + `update` oder `insert` (Write) ohne Transaktion. Bei parallelen QRA-Controller-Läufen können beide `existing = null` sehen und dann beide einen `insert` ausführen → Duplicate-Key-Fehler oder Datenverlust.
  - Lösung: Durch `.upsert()` ersetzen, analog zu `upsertQraEstimate`.

- [ ] **SecService: `fetchCikMapping` – kein Timeout, kein Retry für ~770 KB Download (Z. 18)**
  - Datei: `src/services/SecService.js` (Zeile 18)
  - Problem: `ky.get()` ohne `timeout` und ohne `retry`. Die company_tickers.json ist ~770 KB groß – bei langsamer Verbindung schlägt der Request ohne Timeout-Schutz unkontrolliert fehl.
  - Lösung: `timeout: 60000, retry: { limit: 2, methods: ['get'] }`.

- [ ] **SecService: `fetchFilingContent` – Parallele-Array-Zugriffe ohne Längenvalidierung (Z. 48–75)**
  - Datei: `src/services/SecService.js` (Zeile 48–50)
  - Problem: `recent.form`, `recent.primaryDocument`, `recent.accessionNumber` und `recent.filingDate` sind separate Arrays. Der Code greift mit demselben Index auf alle zu. Bei API-Schemaänderung oder partiellem Fehler können Arrays unterschiedlich lang sein → `undefined`-Werte werden in `matchedFilings` gespeichert.
  - Lösung: Array-Längen prüfen: `if (!recent.form || recent.form.length !== recent.accessionNumber.length) throw ...`

- [ ] **QRAService: Beide `ky.get()`-Calls ohne Timeout und Retry (Z. 17, 43)**
  - Datei: `src/services/QRAService.js` (Zeile 17, 43)
  - Problem: Identisches Muster wie andere Services. Treasury-Seite kann langsam oder kurzzeitig nicht erreichbar sein.
  - Lösung: `timeout: 30000, retry: { limit: 2, methods: ['get'] }` ergänzen.

- [ ] **AlphaVantageOptionService: `callCounter` als Instanz-Variable – kein persistenter Schutz über mehrere Instanzen**
  - Datei: `src/services/AlphaVantageOptionService.js` (Zeile 20–21)
  - Problem: Kommentar verspricht "persistenter Instanz-Counter", aber der Counter lebt nur für die Lebensdauer der Klasse. Bei erneuter Instanziierung (`new AlphaVantageOptionService()`) beginnt er bei 0. Das 25-Calls-Tageslimit wird dann nicht eingehalten.
  - Klärung: Singleton-Einsatz sicherstellen oder Counter in einer Datei/Umgebungsvariable persistieren.

- [ ] **AlphaVantageOptionService: Netzwerk-Fehler als `[]`/`null` – stilles Scheitern**
  - Datei: `src/services/AlphaVantageOptionService.js` (Zeile 96–99, 134–137)
  - Problem: Identisches Muster wie `PolygonIoService.fetchOptionsContractBars` (bereits dokumentiert). Bei Netzwerkfehler wird `[]` / `null` zurückgegeben statt zu werfen. Caller kann nicht zwischen "keine Daten" und "API-Fehler" unterscheiden.

- [ ] **OptionRepository: Chunking ohne Rollback bei Teilfehler – inkonsistente Datenbankzustände**
  - Datei: `src/repositories/OptionRepository.js` (Zeile 39–54)
  - Problem: Bei 3000 Datensätzen (3 Chunks) schreibt Chunk 1 erfolgreich, Chunk 2 wirft eine Exception – Chunk 3 wird nie geschrieben. Chunk 1 ist committed, die Tabelle enthält danach inkonsistente Snapshot-Daten. Kein Rollback-Mechanismus.
  - Lösung: Fehler aus dem Loop akkumulieren und aggregiert werfen, oder Supabase-RPC-Transaktion nutzen.

- [ ] **MarketStatusService: Kein API-Key-Guard im Konstruktor**
  - Datei: `src/services/MarketStatusService.js` (Zeile 7)
  - Problem: `this.apiKey = process.env.POLYGONIO_API_KEY` ohne `if (!this.apiKey) throw`. Bei fehlendem Key schlägt der API-Call mit einem kryptischen Polygon-Fehler fehl, anstatt sofort mit einer verständlichen Exception.

- [ ] **LaborMarketRepository: `getSeries` gibt `data` ohne Null-Check zurück (Z. 14)**
  - Datei: `src/repositories/LaborMarketRepository.js` (Zeile 14)
  - Problem: `return data;` – wenn Supabase `{ data: null, error: null }` liefert (leere Tabelle ohne Fehler-Code), gibt `getSeries()` `null` zurück. Der Caller iteriert dann über `null` → TypeError.
  - Lösung: `return data || [];`

- [ ] **YahooService: `YahooFinance`-Instanz als Modul-Level-Singleton – kein DI, schwer testbar (Z. 2)**
  - Datei: `src/services/YahooService.js` (Zeile 2)
  - Problem: `const yahooFinance = new YahooFinance(...)` wird beim Laden des Moduls ausserhalb der Factory-Funktion erstellt. Nicht per DI austauschbar. Der Test-Mock ist deswegen ungewoehnlich aufwaendig (Klassen-Mock). Bei Initialisierungsfehlern bricht das gesamte Modul.
  - Lösung: `yahooFinance`-Instanz innerhalb von `createYahooService()` erstellen und optional per Parameter injizieren.

- [ ] **FiscalService: `getRecentAuctions` – Zeitzoneninkonsistenz bei Datumsberechnung (Z. 39–41)**
  - Datei: `src/services/FiscalService.js` (Zeile 39–41)
  - Problem: `new Date()` ist lokal, `toISOString()` gibt UTC aus. Bei Server in UTC+2 kurz nach Mitternacht ist der `startDate` um einen Tag verschoben.
  - Lösung: `date.setUTCDate(date.getUTCDate() - daysBack)` konsistent in UTC rechnen.

- [ ] **CboeService: Kein `retry` konfiguriert – trotz 60s Timeout (Z. 14)**
  - Datei: `src/services/CboeService.js` (Zeile 14)
  - Problem: `timeout: 60000` ohne `retry`. Bei Verbindungsabbruch nach 59 Sekunden schlaegt der Call direkt fehl. CBOE produziert gelegentlich temporäre Verbindungsabbrueche bei großen CSV-Downloads.
  - Lösung: `retry: { limit: 1, methods: ['get'], statusCodes: [500, 503] }`

- [ ] **FinnhubService: Finnhub API-Key in `searchParams` – Key-Leaking**
  - Datei: `src/services/FinnhubService.js` (Zeile 32)
  - Problem: `{ token: this.apiKey, ...searchParams }` – Token als Query-Parameter. Identisches Muster wie `SentimentNewsService` (bereits dokumentiert).

- [ ] **CboeService: `'No data found'`-String-Check – zu fragil (Z. 39)**
  - Datei: `src/services/CboeService.js` (Zeile 39)
  - Problem: `responseText.includes('No data found')` – CBOE könnte die Fehlermeldung ändern. Eine HTML-Fehlerseite würde dann als CSV geparst, der `csv-parse`-Parser wirft kryptische Fehler.
  - Lösung: Zusätzlich HTTP-Statuscode auswerten; bei unerwartetem Content-Type abbrechen.

- [ ] **TickerRepository: `getAllTickers` gibt `data` ohne Null-Guard zurück (Z. 35)**
  - Datei: `src/repositories/TickerRepository.js` (Zeile 35)
  - Problem: `return data;` – identisches Problem wie `LaborMarketRepository.getSeries`. Kritisch, da `getAllTickers` der häufigste Einstiegspunkt für alle Controller ist. Supabase `{ data: null, error: null }` → Caller iteriert über `null` → TypeError.
  - Lösung: `return data || [];`

- [ ] **ArchiveRepository: `upsertM5Candles` ohne expliziten `onConflict` (Z. 9)**
  - Datei: `src/repositories/ArchiveRepository.js` (Zeile 9)
  - Problem: `.upsert(candles)` ohne `{ onConflict: 'ticker, timestamp' }`. Im Gegensatz dazu nutzt `CandleRepository.upsertM5Candles` den expliziten Conflict-Key. Supabase fällt ohne Angabe auf den Primary Key zurück – bei Schema-Änderungen können Duplikate entstehen.
  - Lösung: `.upsert(candles, { onConflict: 'ticker, timestamp' })` wie in `CandleRepository`.

- [ ] **EventRepository: `deleteUpcomingEvents` – destruktive Operation ohne Anzahl-Rückgabe (Z. 22–32)**
  - Datei: `src/repositories/EventRepository.js` (Zeile 22–32)
  - Problem: `.delete()` ohne `.select()` gibt keine Information über die Anzahl gelöschter Rows. Bei falschem `fromDateStr` (z.B. `'1970-01-01'`) werden alle Events der Ticker gelöscht ohne dass der Code das erkennt.
  - Lösung: `.delete().select()` ergänzen und die Anzahl der gelöschten Rows im Log ausgeben.

- [ ] **FiscalRepository: `upsertAuctionData` – 14 positionale Parameter (Z. 25–40)**
  - Datei: `src/repositories/FiscalRepository.js` (Zeile 25–40)
  - Problem: 14 positionale Parameter sind fehleranfällig. Eine vertauschte Reihenfolge beim Aufrufen ist nicht sofort sichtbar und führt zu stiller Datenkorrumpierung in der DB. Zwar JSDoc vorhanden, aber der Test auf Z. 32 übergibt alle 14 Werte als Literals ohne Labels.
  - Lösung: Objekt-Parameter: `upsertAuctionData({ auctionDate, issueDate, ... })`.

- [ ] **QRAController: `runBackfill()` – `while`-Loop ohne Early-Exit bei leeren Seiten (Z. 133)**
  - Datei: `src/controllers/QRAController.js` (Zeile 133)
  - Problem: Loop lädt bis zu 30 Seiten, auch wenn ab Seite 2 keine relevanten Links mehr gefunden werden. Kein Early-Exit bei mehreren leeren Seiten. Bei 30 Seiten × 4-Sekunden-Pacing: bis zu 2 Minuten Laufzeit für leere Seiten.
  - Lösung: Counter für leere Seiten; nach 3 aufeinanderfolgenden leeren Seiten abbrechen.

- [ ] **SecController: `_extractLlmContext` – kein Limit für Gesamtergebnis-Größe (Z. 31–53)**
  - Datei: `src/controllers/SecController.js` (Zeile 31–53)
  - Problem: Die Methode akkumuliert beliebig viele Snippets ohne Größen-Limit. Bei hoch-frequenten Keywords in großen Filings können hunderte 3000-Zeichen-Snippets erzeugt werden. `slice(0, 2)` auf Z. 244 mildert das ab, aber `accumulatedSnippets` wächst trotzdem unkontrolliert.

- [ ] **LaborMarketController: `is_preliminary = true` hardcoded im Delta-Sync (Z. 35)**
  - Datei: `src/controllers/LaborMarketController.js` (Zeile 35)
  - Problem: Alle Delta-Sync-Daten werden als vorläufig gespeichert, auch wenn FRED den Wert bereits final revisioniert hat. Kein Prüf-Mechanismus ob ein Wert wirklich vorläufig ist.

- [ ] **TradingCalendarBuilder: Chunking ohne Rollback bei Teilfehler (Z. 80–90)**
  - Datei: `src/core/calendar/TradingCalendarBuilder.js` (Zeile 80–90)
  - Problem: Identisches Muster wie `OptionRepository.insertAlphaVantageRatios`. Wenn Chunk 2 von 18 fehlschlägt, ist Chunk 1 bereits committed. Der Kalender ist inkonsistent (teilweise bis 2050, teilweise nicht).
  - Lösung: Alle Fehler akkumulieren und aggregiert werfen, oder Supabase-RPC-Transaktion nutzen.

- [ ] **OptionsController: `polygonService` als Methoden-Parameter statt Konstruktor-DI (Z. 53, 126)**
  - Datei: `src/controllers/OptionsController.js` (Zeile 53, 126)
  - Problem: `runHistoricSync(polygonService)` und `runBackfillSync(polygonService)` erhalten `polygonService` als Parameter, nicht per Konstruktor. Inkonsistent zu `alphaVantageService`. Aufruf ohne Parameter → TypeError bei `polygonService.fetchOptionsContractBars`.
  - Lösung: `polygonService` in den Konstruktor verschieben.

- [ ] **FinraService: `downloadFileContent` nutzt rohes `ky` statt `this.apiClient` – Browser-Header fehlen**
  - Datei: `src/services/FinraService.js` (Zeile 92)
  - Problem: Der Konstruktor konfiguriert `this.apiClient` mit realistischen Browser-Headern (User-Agent, Accept, Referer). `downloadFileContent` verwendet aber direkt `ky.get()` ohne diese Header. FINRA-CDN könnte Anfragen ohne Browser-Headers blockieren. Inkonsistenz zwischen den zwei Service-Methoden.
  - Lösung: `this.apiClient.get(url, { timeout: 30000 }).text()` statt `ky.get(...)`.

- [ ] **FinraService: URL-Guessing im Fallback generiert Wochenend-URLs – unnötige HTTP-Requests**
  - Datei: `src/services/FinraService.js` (Zeile 74–77)
  - Problem: Fallback-Schleife generiert URLs für alle Tage 1–31 ohne Wochentag-Filter. FINRA-Dateien existieren nur an Handelstagen (Mo–Fr). Samstag/Sonntag-URLs liefern immer 404 → ~8–9 unnötige Requests pro Monat bei Backfill.
  - Lösung: `new Date(year, month-1, day).getDay()` prüfen und Samstag (6) / Sonntag (0) überspringen.

- [ ] **RegulationRepository: `getCurrentRatio` – `data` ohne Null-Check**
  - Datei: `src/repositories/RegulationRepository.js` (Zeile 58)
  - Problem: `return data.ratio_percent;` ohne vorherigen `if (!data)`-Guard. Wenn `error` null ist aber auch `data` null ist (leere Tabelle + `.single()` ohne PGRST116), wirft `data.ratio_percent` einen **TypeError: Cannot read properties of null**.
  - Lösung: `if (!data) throw new Error('Keine Reservequote in der DB gefunden.');`

- [ ] **RegulationRepository: `insertDocument` statt `upsert` – Race Condition möglich**
  - Datei: `src/repositories/RegulationRepository.js` (Zeile 27–40)
  - Problem: Der Controller prüft mit `documentExists()` (Call 1) und inserted dann mit `insertDocument()` (Call 2). Beide Calls sind **nicht atomar**. Bei parallelen Sync-Läufen können beide Prozesse gleichzeitig `documentExists=false` sehen und dann beide `insert` ausführen → **Unique-Constraint-Fehler**. Zusätzlich: `.insert()` bei bereits vorhandenem Dokument wirft Fehler statt idempotent zu sein.
  - Lösung: `.upsert([...], { onConflict: 'document_number', ignoreDuplicates: true })` statt `.insert()`.

---

## 🟡 Niedrig – Verbesserungspotenzial

- [ ] **ArchiveRepository: `upsertM5Candles` Return-Wert ungenau**
  - Datei: `src/repositories/ArchiveRepository.js` (Zeile 15)
  - Problem: Gibt `candles.length` zurück statt tatsächliche Anzahl erfolgreicher Upserts. Supabase Response wird nicht ausgewertet.

- [ ] **ArchiveController: Fehlende Test-Coverage**
  - Datei: `tests/controllers/ArchiveController.test.js`
  - Fehlende Tests: Fehler bei `upsertM5Candles`, Fehler beim Log-Upsert, Fehler beim Delete, verschiedene `daysToKeep`-Werte, mehrere Paginations-Batches (>1000 Candles).

- [ ] **EventsController: Fehlende Test-Coverage**
  - Datei: `tests/controllers/EventsController.test.js`
  - Fehlende Tests: `deleteUpcomingEvents` wirft Fehler (Datenverlust-Szenario), `upsertEvents` wirft Fehler nach erfolgreichem Delete, Alpha Vantage Rate-Limit-Response (`data["Note"]`), leere/null FDA-Response, fehlender API-Key bei `runBackfill`.

- [ ] **EventsController: `index` als Closure-Variable in `processItemsSafely`**
  - Datei: `src/controllers/EventsController.js` (Zeile 119, 122)
  - Problem: `let index = 0` außerhalb der Loop, `index++` im Callback. Funktioniert weil `processItemsSafely` sequentiell ist – aber fragil falls jemand parallelisiert.

- [ ] **Redundantes `this.pacingManager` entfernen**
  - Dateien: `CboeController`, `EventsController`, `FinraController`, `FredController`, `SentimentNewsController`
  - Problem: BaseController speichert `this.pacingManager` bereits. Doppelte Zuweisung in Subklassen.

- [ ] **Router: Inkonsistente DI für MarketStatusService / PolygonIoService**
  - Datei: `src/core/Router.js` (Zeile 80, 160, 170)
  - Problem: Lokaler Import + Instanziierung in `run*`-Methoden statt über ControllerRegistry.

- [ ] **Router: `TradingCalendarBuilder` umgeht Controller-Schicht**
  - Datei: `src/core/Router.js` (Zeile 234–238)
  - Problem: Kein Controller-Wrapper, kein `executeJob`, kein einheitliches Error-Handling.

- [ ] **CandleRepository: Dupliziertes Mapping in `upsertDailyCandles` und `upsertM5Candles`**
  - Datei: `src/repositories/CandleRepository.js` (Zeile 87–97 vs. 117–127)
  - Problem: Identischer Mapping-Code (Polygon-Format → DB-Format) an zwei Stellen.
  - Lösung: Private `_mapPolygonCandles(tickerId, aggregates)` Methode extrahieren.

- [ ] **CandleRepository: `getLatestDailyTimestamp` / `getLatestM5Timestamp` fast identisch**
  - Datei: `src/repositories/CandleRepository.js` (Zeile 26–62)
  - Problem: Nur der Tabellenname unterscheidet sich. Generische `_getLatestTimestamp(tableName, tickerId)` wäre DRY.

- [ ] **DailyController: Fehlende Test-Coverage**
  - Datei: `tests/controllers/DailyController.test.js`
  - Fehlende Tests:
    - Fehler in `fetchHistoricalData` (Netzwerkfehler)
    - Fehler in `upsertDailyCandles` (DB-Fehler → Candle-Gap)
    - Mehrere Ticker, gemischte Ergebnisse (einer OK, einer wirft Fehler)
    - `getArchivedUntilTimestamp` wird nicht gemockt – fehlt im Setup gänzlich (da DailyController den Aufruf aktuell nicht macht)

- [ ] **M5Controller: Fehlende Test-Coverage**
  - Datei: `tests/controllers/M5Controller.test.js`
  - Fehlende Tests:
    - `archivedUntil > latestTimestamp` → Fallback-Pfad (Zeile 39–41) nicht abgedeckt
    - `upsertM5Candles` wirft Fehler → Chunk-Gap-Szenario
    - Mehrere Ticker, gemischte Ergebnisse
    - `getArchivedUntilTimestamp` wirft Nicht-PGRST116-Fehler

- [ ] **Router: Doppeltes Start/Ende-Logging**
  - Problem: `Router.execute()` loggt Start/Ende UND `BaseController.executeJob()` loggt nochmal.

- [ ] **SecController: Toter Import entfernen**
  - Datei: `src/controllers/SecController.js` (Zeile 3)
  - Problem: `ky` wird importiert aber nie verwendet.

- [ ] **SecController: `runMasterSync` refactoren**
  - Datei: `src/controllers/SecController.js`
  - Problem: ~200 Zeilen mit tiefer Verschachtelung. Schwer lesbar.

- [ ] **QRA/SecController: `process.cwd()` durch robusteren Pfad ersetzen**
  - Dateien: `src/controllers/QRAController.js`, `src/controllers/SecController.js`
  - Problem: Fragil bei verändertem Working Directory.

- [ ] **ClimaxController: Date-Mutation vermeiden**
  - Datei: `src/controllers/ClimaxController.js` (Zeile 29–32)
  - Problem: `now.setDate(now.getDate() - 45)` mutiert das `now`-Objekt, das vorher für `endTs` genutzt wurde. Aktuell harmlos, aber jeder der später `now` weiterverwendet, bekommt ein Datum vor 45 Tagen.
  - Lösung: `new Date()` statt `now` in Zeile 32 verwenden.

- [ ] **ClimaxController: Fehlende Test-Coverage**
  - Datei: `tests/controllers/ClimaxController.test.js`
  - Fehlende Tests: DB-Fehler (`candleError`, `finraError`, `cboeError`), `processItemsSafely` Fehler-Schluck-Verhalten, SellingClimaxScorer hat keine eigenen Unit-Tests.

- [ ] **SellingClimaxScorer: Max-Score überschreitet 100**
  - Datei: `src/core/analysis/SellingClimaxScorer.js`
  - Info: Theoretischer Max-Score ist 115 (30+50+15+20). Wird korrekt per `Math.min(score, 100)` gecapped, aber die Übergewichtung ist undokumentiert.

- [ ] **SectorRotationController: Initiales Seeding klären**
  - Datei: `src/controllers/SectorRotationController.js`
  - Problem: Kein `runBackfill`. `runDailySync` wirft Fehler ohne vorheriges Log. Wie entsteht der erste Eintrag?

- [ ] **SectorRotationController: RSI-Methode dokumentieren**
  - Problem: Nutzt SMA statt Wilder's EMA. Falls bewusst: Kommentar hinzufügen.

- [ ] **FinraController: Hardcodierte Jahres-Werte**
  - Problem: `START_YEAR=2026`, `END_YEAR=2024` werden veralten.

- [ ] **OptionsController: `polygonService` als Constructor-Dependency**
  - Problem: Wird als Methoden-Parameter übergeben statt via DI.

- [ ] **FiscalController: Redundanter innerer `try/catch` in `_processAuctions` + `processItemsSafely`**
  - Datei: `src/controllers/FiscalController.js` (Zeile 42–116)
  - Problem: `processItemsSafely` fängt bereits alle Fehler. Der innere `try/catch` (Z. 43–115) macht `errorCount++` unerreichbar (Fehler wird nie nach außen geworfen). Der `errorCount`-Zähler bleibt damit stets auf 0 – irreführend.
  - Klärung: Entweder `processItemsSafely` entfernen und eigene Schleife mit Zähler schreiben, oder den inneren `try/catch` entfernen und `errorCount` aufgeben.

- [ ] **FiscalController.test.js: Fehlende Test-Coverage**
  - Datei: `tests/controllers/FiscalController.test.js`
  - Fehlende Tests:
    - Auktion ohne CUSIP (`cusip: null`) → `wasEmptyBefore` immer `true` → unerwünschtes Event-Firing
    - `EventBus.emit` wird nicht verifiziert (ob tatsächlich gefeuert)
    - Float-Ungenauigkeit `proxyTail`: Test nutzt `expect.any(Number)` statt `toBeCloseTo(0.1, 5)`
    - `runBackfill` mit mehr Auktionen als `BACKFILL_LIMIT` (Pagination nicht getestet)
    - `FiscalService.fetchAuctions` gibt `undefined` zurück (fehlendes `data`-Feld in Response)

- [ ] **FiscalService: Fehlender `null`-Check auf `response.data`**
  - Datei: `src/services/FiscalService.js` (Zeile 28)
  - Problem: `return response.data` ohne Guard. Bei Formatänderung der Treasury API (kein `data`-Feld) → `undefined` zurück → im Controller `[...undefined]` → **TypeError**.
  - Lösung: `return response?.data ?? [];`

- [ ] **DateHelper: `toSqlDate` nutzt lokale Zeitzone statt UTC**
  - Datei: `src/core/DateHelper.js` (Zeile 7–12)
  - Problem: `getFullYear()`, `getMonth()`, `getDate()` sind lokal. Auf Servern in anderen Zeitzonen (z.B. US-EST/PST) kann das Datum für `fromDateStr`/`toDateStr` um 1 Tag abweichen → falscher Sync-Bereich für M5Controller und DailyController.
  - Lösung: `date.toISOString().split('T')[0]` verwenden (immer UTC).

- [ ] **YahooService: Modul-Level-Singleton erschwert Testbarkeit**
  - Datei: `src/services/YahooService.js` (Zeile 2)
  - Problem: `const yahooFinance = new YahooFinance(...)` auf Modul-Ebene. Tests müssen das gesamte Modul mocken (`vi.mock`), statt über DI einen Mock zu injizieren.
  - Lösung: Instanz in `createYahooService()` erzeugen oder als Parameter übergeben.

- [ ] **FredService: Hardcodiertes Backfill-Startdatum `2021-01-01`**
  - Datei: `src/services/FredService.js` (Zeile 58)
  - Problem: `getBackfillData()` startet immer ab `'2021-01-01'` (hartkodiert). Wird mit der Zeit zu kurz oder muss für neue Serien angepasst werden.
  - Lösung: Als Konstante oder optionalen Parameter auslagern.

- [ ] **GlobalMacroService + LaborMarketService: Fehlende Test-Coverage**
  - Dateien: `tests/services/GlobalMacroService.test.js` · `tests/services/LaborMarketService.test.js`
  - Fehlende Tests:
    - `response.observations` ist `null` oder `undefined` (fehlende API-Antwort-Struktur) → Service gibt `undefined` zurück
    - Kein Test für fehlendes `timeout`/`retry` Verhalten (kein Timeout-Test)
    - `fetchSeriesData` mit leerem `startDate` (undefined/null)

- [ ] **FinraService: Kein `retry` auf `this.apiClient` konfiguriert**
  - Datei: `src/services/FinraService.js` (Zeile 9–18)
  - Problem: `ky.create()` hat `timeout: 20000` aber kein `retry`. Transiente Netzwerkfehler beim Abrufen des FINRA-API-Katalogs führen sofort zum Fallback-URL-Guessing – obwohl ein einfacher Retry genügen würde.
  - Lösung: `retry: { limit: 2, methods: ['get'] }` ergänzen.

- [ ] **RegulationService: Kein `timeout`, kein `retry` auf `ky.get()`**
  - Datei: `src/services/RegulationService.js` (Zeile 19)
  - Problem: Identisches Muster wie GlobalMacroService/LaborMarketService: blankes `ky.get()` ohne Timeout- oder Retry-Konfiguration.
  - Lösung: `ky.get(BASE_URL, { searchParams, timeout: 15000, retry: { limit: 2, methods: ['get'] } })`.

- [ ] **FinraRepository.test.js: Test-Assertions in `getExistingMonths` vermutlich falsch**
  - Datei: `tests/repositories/FinraRepository.test.js` (Zeile 89–90)
  - Problem: Mock-Timestamps `1775606400` und `1772409600` entsprechen `2026-06` und `2026-04`. Der Test erwartet aber `'2026-04'` und `'2026-03'` – `'2026-03'` kann aus diesen Werten nicht entstehen. Test läuft durch, ist aber inhaltlich inkonsistent und könnte echte Bugs verdecken.
  - Klärung: Timestamps gegen echte Datumswerte validieren und Assertions korrigieren.

- [ ] **CboeRepository + FinraRepository: Fehlende Konstruktor-Validierung für `supabaseClient`**
  - Dateien: `src/repositories/CboeRepository.js` (Z. 4–8) · `src/repositories/FinraRepository.js` (Z. 6–8)
  - Problem: Kein `if (!supabaseClient) throw`-Guard im Konstruktor. Gleiches fehlende Pattern wie bei allen anderen Repositories (Referenz: `EventRepository` als Vorbild).

- [ ] **LLMService: `createPacingManager()` als Default-Parameter – potenzielles Singleton-Problem**
  - Datei: `src/services/LLMService.js` (Zeile 11)
  - Problem: `constructor(pacingManager = createPacingManager())` – Default-Parameter werden einmalig beim Laden des Moduls evaluiert, nicht bei jedem `new LLMService()`. Alle Instanzen ohne expliziten `pacingManager` könnten denselben Manager teilen (abhängig vom Modul-Caching-Verhalten).
  - Lösung: `constructor(pacingManager = null) { this.pacingManager = pacingManager ?? createPacingManager(); }`

- [ ] **LLMService: `GROQ_API_KEY` aus `process.env` statt per DI – inkonsistent**
  - Datei: `src/services/LLMService.js` (Zeile 13)
  - Problem: `pacingManager` wird per DI übergeben, `GROQ_API_KEY` aber direkt aus `process.env` gelesen. Inkonsistent zum Factory-Function-Pattern der anderen Services; erschwert Unit-Tests.

- [ ] **SentimentNewsService: `fetchSentiments` – Error-Wrapping verliert Stack-Trace**
  - Datei: `src/services/SentimentNewsService.js` (Zeile 121)
  - Problem: `throw new Error(\`Finnhub Fehler für ${ticker}: ${error.message}\`)` wickelt den Fehler in einen neuen `Error` ein und verliert den originalen Stack-Trace.
  - Lösung: `throw new Error(..., { cause: error })` (Node 16.9+).

- [ ] **LLMService: Fehlende Test-Coverage**
  - Datei: `tests/services/LLMService.test.js`
  - Fehlende Tests:
    - `_queryGroq` mit Status 401 → `return null`-Pfad für `analyzeSecSnippet` / `parseQraConsensus` nicht separat getestet
    - `analyzeMacroEvent` mit `null`-Rückgabe von Groq (kein Erfolgs-Test ohne Mock-Daten)
    - `_queryGemini` mit JSON-Parse-Fehler (ungültige LLM-Antwort)

- [ ] **NotificationService: NTFY-Topic in Logs – potenziell sensitive Info**
  - Datei: `src/services/NotificationService.js` (Zeile 41)
  - Problem: `this.ntfyTopic` wird im Erfolgs-Log ausgegeben. Wer den Topic-Namen kennt, kann Push-Nachrichten empfangen oder senden. Kein kritisches Problem, aber sollte maskiert werden (z.B. nur die ersten 4 Zeichen zeigen).

- [ ] **QRAService: RegEx zu eng – kein Alert bei Treasury-Formulierungsänderung (Z. 53, 57)**
  - Datei: `src/services/QRAService.js` (Zeile 53, 57)
  - Problem: Die RegEx für Net Borrowing (`/borrow\s+\$?([0-9,]+)\s+billion/i`) und TGA Balance (`/cash balance of...`) sind eng auf die aktuelle Treasury-Formulierung zugeschnitten. Bei Formulierungsänderung: `return null` + `console.warn` – kein Alert, kein Push. Die QRA-Daten fehlen ohne weitere Meldung.
  - Lösung: Fallback-RegEx ergänzen und/oder `NotificationService.send()` auslösen.

- [ ] **SecRepository: Fehlende Test-Coverage**
  - Datei: `tests/repositories/SecRepository.test.js`
  - Fehlende Tests:
    - `saveRawFiling` mit `data = null` nach erfolgreichem Insert (→ `data.id` wirft TypeError)
    - `fmpFundamentalExists` DB-Fehler-Kettenwirkung: `false` → `saveFmpFundamentals` → Duplicate-Key
    - `getCompaniesWithoutCik` mit leerem Ergebnis (`data = []`)
    - `saveAiSignals` mit `null` statt leerem Array

- [ ] **AlphaVantageOptionService: `createPacingManager()` als Default-Parameter – Singleton-Problem**
  - Datei: `src/services/AlphaVantageOptionService.js` (Zeile 11)
  - Problem: Identisches Muster wie `LLMService` (Paket 3, Finding 8): Default-Parameter wird einmalig beim Laden des Moduls evaluiert.

- [ ] **MarketStatusService + AlphaVantageOptionService: `import 'dotenv/config'` als Side-Effect im Service**
  - Dateien: `src/services/MarketStatusService.js` (Z. 2) · `src/services/AlphaVantageOptionService.js` (Z. 2)
  - Problem: `dotenv/config` als Side-Effect-Import in einem Service. In Test-Umgebungen ohne `.env`-Datei kann das zu Warnings führen. Setup gehört in den Einstiegspunkt (`index.js`).

- [ ] **OptionRepository: `scraped_at` mit Millisekunden-Granularität als Conflict-Key**
  - Datei: `src/repositories/OptionRepository.js` (Zeile 26, 47)
  - Problem: `onConflict: 'contract_id,scraped_at'` – `scraped_at` wird per `new Date().toISOString()` gesetzt. Zwei Aufrufe innerhalb von 1ms erzeugen keinen Conflict → doppelte Zeilen möglich. Der Conflict-Key ist zu fein für einen zuverlässigen Upsert-Schutz.
  - Klärung: Soll `scraped_at` auf Minuten gerundet werden?

- [ ] **SectorRotationRepository: `.limit(1)` + `.single()` – redundantes Antipattern (Z. 23)**
  - Datei: `src/repositories/SectorRotationRepository.js` (Zeile 21–23)
  - Problem: `.limit(1).single()` – `.single()` wirft bei mehr als einem Ergebnis einen Fehler. In Kombination mit `.limit(1)` ist das zwar sicher, gilt aber als Antipattern in Supabase.
  - Lösung: `.limit(1)` beibehalten, `.single()` entfernen und `data[0]` manuell zugreifen.

- [ ] **MarketStatusService + AlphaVantageOptionService: Fehlende Test-Coverage**
  - Dateien: `tests/services/MarketStatusService.test.js` · `tests/services/AlphaVantageOptionService.test.js`
  - Fehlende Tests:
    - `isMarketOpen` mit `extended-hours` Status (weder `true` noch `false`)
    - `fetchIntradayRatios` mit `contract.type = null` → `.toUpperCase()` TypeError
    - `fetchIntradayRatios` mit `volume_open_interest_ratio = null` → `parseFloat(null)` = `NaN` → 0 (Fallback ungetestet)

- [ ] **FinnhubService: `console.warn` statt `throw` bei fehlendem API-Key (Z. 12)**
  - Datei: `src/services/FinnhubService.js` (Zeile 11–13)
  - Problem: `if (!this.apiKey) { console.warn(...); }` – kein `throw`. Der Code läuft weiter und schlaegt erst beim ersten `_fetch()`-Call mit einem kryptischen 401 fehl. Inkonsistent zu `SentimentNewsService`, der im Konstruktor korrekt wirft.
  - Lösung: `throw new Error('FINNHUB_API_KEY fehlt!')` wie in `createSentimentNewsService`.

- [ ] **FinnhubService: `import 'dotenv/config'` als Side-Effect im Service (Z. 2)**
  - Datei: `src/services/FinnhubService.js` (Zeile 2)
  - Problem: Identisches Muster wie `MarketStatusService` und `AlphaVantageOptionService` (bereits dokumentiert).

- [ ] **YahooService: `fetchYieldForDate` gibt `null` bei Fehler zurück – stilles Scheitern (Z. 76–79)**
  - Datei: `src/services/YahooService.js` (Zeile 76–79)
  - Problem: Analoges Muster wie `AlphaVantageOptionService`/`PolygonIoService`. Caller bekommt `null` und muss selbst entscheiden ob das ein valider "kein Handelstag"-Fall oder ein echter Fehler ist.

- [ ] **FiscalService + CboeService: Fehlende Test-Coverage**
  - Dateien: `tests/services/FiscalService.test.js` · `tests/services/CboeService.test.js`
  - Fehlende Tests:
    - `fetchAuctions` mit `response.data = undefined` (→ `undefined` returned)
    - `fetchAuctions` mit `response.data = null` (→ `null` returned)
    - `CboeService`: Kein Test für ungültigen CSV-Content (HTML-Fehlerseite statt CSV → CSV-Parser-Fehler)
    - `CboeService`: Leere Response `responseText = ''` (Grenzfall)

- [ ] **ArchiveRepository: Kein Konstruktor-Guard (Designinkonsistenz)**
  - Datei: `src/repositories/ArchiveRepository.js`
  - Problem: Alle anderen Repositories mit Class-Syntax prüfen `if (!supabaseClient) throw`. `ArchiveRepository` hat keinen Konstruktor, da der Client global importiert wird. Designinkonsistenz.

- [ ] **CandleRepository: `upsertDailyCandles` / `upsertM5Candles` – Code-Duplizierung (Z. 87–137)**
  - Datei: `src/repositories/CandleRepository.js` (Zeile 87–137)
  - Problem: Die beiden Methoden sind nahezu identisch (nur Tabellenname unterscheidet sich). Bei einem Bug muss die andere Methode manuell synchronisiert werden.
  - Lösung: Private Hilfsmethode `_upsertCandles(table, tickerId, aggregates)` extrahieren.

- [ ] **CandleRepository: `.limit(1)` + `.single()` – redundantes Antipattern (Z. 14, 33, 52)**
  - Datei: `src/repositories/CandleRepository.js` (Zeile 14, 33, 52)
  - Problem: Identisches Antipattern wie `SectorRotationRepository` (bereits dokumentiert). `.single()` ist redundant bei gesetztem `.limit(1)`.

- [ ] **TickerRepository: `getTickersForJob` – kein Guard gegen ungültige `jobName`-Werte (Z. 43)**
  - Datei: `src/repositories/TickerRepository.js` (Zeile 43)
  - Problem: `jobName = undefined` ergibt eine Query mit `sync_type = undefined` → leeres Ergebnis ohne Fehler. Ein Typo im Aufrufer gibt einfach `[]` zurück statt zu werfen.
  - Lösung: `if (!Object.values(SYNC_JOBS).includes(jobName)) throw new Error(...)` am Methodenanfang.

- [ ] **FiscalRepository + EventRepository + CandleRepository: Fehlende Test-Coverage**
  - Dateien: `tests/repositories/FiscalRepository.test.js` · `tests/repositories/EventRepository.test.js` · `tests/repositories/CandleRepository.test.js`
  - Fehlende Tests:
    - `updateAuctionTail`: kein Test für `{ error: null, data: null }` nach Update (Row existiert nicht)
    - `deleteUpcomingEvents` mit `tickerIds = null` statt `[]` → `null.length` → TypeError
    - `CandleRepository.getArchivedUntilTimestamp`: nicht getestet
    - `getAllTickers` mit gesetztem `typeId` (gefilterter Pfad)

- [ ] **SellingClimaxScorer: `today.volume` ohne Null-/Undefined-Check (Z. 28)**
  - Datei: `src/core/analysis/SellingClimaxScorer.js` (Zeile 28)
  - Problem: `today.volume / avgVol20` – `today.volume` könnte `undefined` sein (Candle ohne Volume-Feld) → `NaN` → alle `if (volRatio > ...)` Vergleiche scheitern still → Score = 0 ohne Warnung.
  - Lösung: `const volRatio = (avgVol20 > 0 && today.volume != null) ? today.volume / avgVol20 : 0;`

- [ ] **SectorRotationController: `V_FACTORS` als hardcoded Modul-Level-Konstante (Z. 6–15)**
  - Datei: `src/controllers/SectorRotationController.js` (Zeile 6–15)
  - Problem: Neue ETFs erfordern Code-Änderungen. Eine externe Konfiguration wäre robuster.

- [ ] **LaborMarketController + OptionsController: Fehlende Test-Coverage**
  - Dateien: `tests/controllers/` (nicht vorhanden)
  - Problem: Keine Test-Files für `LaborMarketController` und `OptionsController` gefunden.

- [ ] **QRAController: `fs.readFileSync` blockiert Event Loop im Debug-Modus (Z. 32)**
  - Datei: `src/controllers/QRAController.js` (Zeile 32)
  - Problem: Synchrones Datei-Lesen in einem `async`-Kontext blockiert den Node.js-Event-Loop. Nur im Debug-Modus aktiv, aber trotzdem schlechtes Pattern.
  - Lösung: `await fs.promises.readFile(filePath, 'utf-8')`
