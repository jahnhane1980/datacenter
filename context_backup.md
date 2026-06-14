25 Dateien noch nicht geprüft. Ich schlage folgende Priorisierung vor:                                                               
• Priorität 1 (Business Logic): 5 fehlende Controller +  SellingClimaxScorer.js  +  TradingCalendarBuilder.js  +  PacingManager.js
• Priorität 2 (Infra/Routing):  ActionRouter.js ,  ControllerRegistry.js ,  Router.js ,  DateHelper.js ,  SupabaseClient.js
• Priorität 3 (Statisch/Daten): 6  actions/ , 5  prompts/ , 2  constants/  (meist statischer Code mit wenig Logik)    

>> okay, mitte als erstes Priorität 1 analysieren und entsprechend dokumentieren, dann Priorität 2.Von  PRiorität 3 nur die Dateien unter actions. NAch jedem Schritt/abaarbeitung des Paketes zurück melden, bevor der nächste Analyse & dokumenationszyklus startet.


Frage, wurde diese Analyse:
 ## 🔍 Analyse: Priorität 1 – 5 Controller + SellingClimaxScorer + TradingCalendarBuilder + PacingManager                             
  ──────                                                                                                                               
  ### 🔴 Hoch                                                                                                                          
                                                                                                                                       
  1. QRAController:  runSync()  – Monat-Check nutzt lokale Zeitzone (Z. 55)                                                            
                                                                                                                                       
    const month = now.getMonth() + 1;                                                                                                  
                                                                                                                                       
  Identisches Problem wie  QRAService  (bereits dokumentiert) – hier aber im Controller, der die eigentliche Ausführungsentscheidung   
  trifft. Auf einem Server in UTC+2 kann nahe Mitternacht der falsche Monat ermittelt werden → QRA-Sync läuft nicht (oder läuft        
  außerplanmäßig).                                                                                                                     
                                                                                                                                       
  • Lösung:  now.getUTCMonth() + 1                                                                                                     
                                                                                                                                       
  2. QRAController:  runConsensusSync()  –  ky.get(rssUrl)  ohne Timeout, Retry und Error-Handling (Z. 211)                            
                                                                                                                                       
    const responseText = await ky.get(rssUrl).text();                                                                                  
                                                                                                                                       
  Kein  try/catch , kein Timeout, kein Retry. Google News RSS ist ein externer Dienst – schlägt er fehl, wird der gesamte Job mit einer
  unbehandelten Exception beendet. Das  executeJob -Wrapper von  BaseController  fängt das zwar ab, aber ohne spezifische Fehlermeldung
  für den Operator.                                                                                                                    
                                                                                                                                       
  3. SecController:  runMasterSync()  –  yahooFinance  direkt importiert, nicht per DI (Z. 4, 122)                                     
                                                                                                                                       
    import yahooFinance from 'yahoo-finance2';                                                                                         
    // ...                                                                                                                             
    const fundamentalsData = await yahooFinance.fundamentalsTimeSeries(...)                                                            
                                                                                                                                       
   yahoo-finance2  wird als Modul-Level-Import direkt genutzt – nicht als DI-Parameter. Fehler bei der Initialisierung oder bei Rate-  
  Limiting brechen direkt den Controller-Flow (kein Retry, kein Wrapping). Zusätzlich: Der try/catch auf Z. 119 fängt Yahoo-Fehler     
  korrekt ab, gibt sie aber nur als  console.error  aus – die Firma wird danach trotzdem mit dem SEC-Parsing fortgesetzt. Das ist      
  möglicherweise gewollt, aber die FMP-Fundamentals fehlen dann.                                                                       
                                                                                                                                       
  4. SectorRotationController: Array-Index-Überläufe bei RSI/Momentum-Berechnung (Z. 118–126)                                          
                                                                                                                                       
    const idxMinus60 = etfIndex - 60;                                                                                                  
    const idxMinus20 = etfIndex - 20;                                                                                                  
    const etfPerf60 = (currentEtf.close - etfData[idxMinus60].close) / ...                                                             
                                                                                                                                       
  Wenn  etfIndex < 60  oder  etfIndex < 20 , wird  etfData[-N]  →  undefined  →  undefined.close  → TypeError. Zwar ist auf Z. 111 ein 
  Guard  if (etfIndex < 70) continue;  vorhanden – aber dieser prüft nur ob  etfIndex >= 70 , nicht ob gleichzeitig  spyData[i - 60]   
  (Z. 122) existiert. Wenn  i < 60  im SPY-Loop, schlägt Z. 122 fehl. Der SPY-Loop beginnt bei  i = 70  (Z. 95), also ist  i - 60 = 10 
  immer positiv – das Risiko besteht nur indirekt über den ETF-Index, der nicht synchron mit dem SPY-Index läuft.                      
                                                                                                                                       
  • Klärung: Ist sichergestellt, dass der ETF-Index immer ≥ 70 ist, wenn  i >= 70 ?                                                    
  ──────                                                                                                                               
  ### 🟠 Mittel                                                                                                                        
                                                                                                                                       
  5. QRAController:  runBackfill()  –  while -Loop mit Seiten-Limit 30, aber ohne Inhalts-Validierung (Z. 133)                         
                                                                                                                                       
    while (foundCount < TARGET_QUARTERS_TO_FIND && page < 30) {                                                                        
                                                                                                                                       
  Der Loop lädt bis zu 30 Seiten, auch wenn schon auf Seite 2 keine relevanten Links mehr gefunden werden. Kein "early exit" wenn      
  mehrere aufeinanderfolgende Seiten leer sind. Bei 30 Seiten × 4-Sekunden-Pacing: bis zu 2 Minuten Laufzeit für leere Seiten.         
                                                                                                                                       
  • Lösung: Counter für leere Seiten; nach 3 leeren Seiten abbrechen.                                                                  
                                                                                                                                       
  6. SecController:  _extractLlmContext  – kein Limit für Gesamtergebnis-Größe (Z. 31–53)                                              
  Die Methode akkumuliert beliebig viele Snippets ohne Größenlimit. Wenn ein Filing-Dokument sehr groß ist und ein Keyword häufig      
  vorkommt, können hunderte von 3000-Zeichen-Snippets erzeugt werden → kombinierter LLM-Context wird massiv zu groß → Groq-API lehnt ab
  (Token-Limit) oder erzeugt Rate-Limit-Fehler.                                                                                        
                                                                                                                                       
  • Hinweis: Auf Z. 244 wird bereits  slice(0, 2)  angewendet, was das tatsächliche Risiko abmildert, aber  accumulatedSnippets  kann  
  trotzdem auf hunderte Einträge anwachsen, bevor das Slicing greift.                                                                  
                                                                                                                                       
  7. LaborMarketController:  runDailySync()  –  is_preliminary = true  hardcoded (Z. 35)                                               
                                                                                                                                       
    true // Im Delta-Sync gehen wir von vorläufigen Daten aus                                                                          
                                                                                                                                       
  Alle Delta-Sync-Daten werden als  is_preliminary = true  gespeichert, auch wenn der FRED-Datensatz final ist. FRED liefert revidierte
  (finale) Daten genauso wie vorläufige – ohne weitere Prüfung. Ein Datenpunkt vom Delta-Sync überschreibt per Upsert einen            
  existierenden vorläufigen Wert korrekt, aber schreibt  is_preliminary = true  auch dann, wenn FRED den Wert als final revisioniert   
  hat.                                                                                                                                 
                                                                                                                                       
  • Klärung: Gibt es in den FRED-Observations einen  preliminary -Indikator oder muss das manuell bestimmt werden?                     
                                                                                                                                       
  8. TradingCalendarBuilder: Chunking ohne Rollback bei Teilfehler (Z. 80–90)                                                          
  Identisches Problem wie  OptionRepository.insertAlphaVantageRatios  (Paket 5, Finding 5): Wenn Chunk 2 von 18 fehlschlägt, sind Chunk
  1 bereits in der DB – die Tabelle enthält inkonsistente Kalender-Daten. Da der Kalender bis 2050 berechnet wird, sind das bis zu     
  18.000 Datensätze in 18 Chunks.                                                                                                      
                                                                                                                                       
  • Lösung: Fehler erst nach dem Loop werfen oder Supabase-RPC-Transaktion nutzen.                                                     
                                                                                                                                       
  9. OptionsController:  runHistoricSync  /  runBackfillSync  –  polygonService  als Parameter übergeben, nicht im Konstruktor (Z. 53, 
  126)                                                                                                                                 
   polygonService  wird als Methoden-Parameter statt als Konstruktor-DI übergeben. Inkonsistenz zu  alphaVantageService  (Konstruktor).
  Wenn der Caller  runHistoricSync()  ohne Parameter aufruft, schlägt  polygonService.fetchOptionsContractBars  mit TypeError fehl.    
                                                                                                                                       
  • Lösung:  polygonService  in den Konstruktor verschieben wie  alphaVantageService .                                                 
  ──────                                                                                                                               
  ### 🟡 Niedrig                                                                                                                       
                                                                                                                                       
  10. PacingManager:  humanDelay()  /  scrapingDelay()  –  process.env.NODE_ENV === 'test'  Check (Z. 25, 35)                          
  Der Test-Guard funktioniert korrekt. Aber: Wenn der Aufrufer eine Instanz direkt mockt (z.B.  service._burstDelay = vi.fn() ), ist   
  dieser Guard irrelevant. Kein echtes Problem, aber der Guard macht den Code produktionsabhängig von Env-Variablen.                   
                                                                                                                                       
  11. SellingClimaxScorer:  calculateScore  – Division-by-Zero bei  volRatio  stillschweigend abgefangen (Z. 28)                       
                                                                                                                                       
    const volRatio = avgVol20 > 0 ? today.volume / avgVol20 : 0;                                                                       
                                                                                                                                       
  Korrekt abgesichert – positiv. Aber:  today.volume  könnte  undefined  sein (wenn  CandleRepository  Candles ohne Volume-Feld        
  liefert) →  undefined / avgVol20  →  NaN  → alle  if (volRatio > ...)  Vergleiche schlagen fehl → Score = 0 ohne Warnung.            
                                                                                                                                       
  • Lösung:  const volRatio = (avgVol20 > 0 && today.volume) ? today.volume / avgVol20 : 0;                                            
                                                                                                                                       
  12. SectorRotationController: V_FACTORS als Modul-Level-Konstante – nicht testbar/konfigurierbar (Z. 6–15)                           
  Die  V_FACTORS -Map ist hardcoded im Modul. Neue ETFs müssen Code-Änderungen auslösen. Eine externe Konfiguration (JSON, DB) wäre    
  robuster.                                                                                                                            
                                                                                                                                       
  13. LaborMarketController + OptionsController: Fehlende Test-Coverage                                                                
  Keine Test-Files gefunden für diese Controller (im Gegensatz zu M5Controller, DailyController etc.).                                 
                                                                                                                                       
  14. QRAController:  fetchOrLoadHtml  –  fs.readFileSync  blockiert Event Loop (Z. 32)                                                
                                                                                                                                       
    return fs.readFileSync(filePath, 'utf-8');                                                                                         
                                                                                                                                       
  Synchrones Dateisystem-Lesen in einem  async -Kontext blockiert den Node.js-Event-Loop. Für große HTML-Caches könnte das spürbare    
  Latenz erzeugen. Nur relevant im Debug-Modus ( DEBUG_SAVE_SNIPPETS = true ), aber dennoch schlechtes Pattern.                        
                                                                                                                                       
  • Lösung:  fs.promises.readFile(filePath, 'utf-8')  verwenden.                                                                       
  ──────                                                                                                                               
  Jetzt in die TODO.md eintragen:                                                                                                      


In die TODO.md eingetragen? Falls nicht bitte nachholen. 


Du hast gesagt, folgende Dateien wurden nur erwähnt: BaseController.js,vArchiveSupabaseClient.js und EventBus.js 