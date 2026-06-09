# Event-Driven Alerting Queue

Dieses Verzeichnis (`tmp_event`) dient als lokaler, dateibasierter Event-Bus für FinanceOS.

## Wie es funktioniert:
1. **Event Emission:** Die Controller (z.B. FiscalController, QraController) bemerken während des Daten-Syncs wichtige Änderungen (z.B. ein ausgefülltes Auktionsergebnis).
2. **Die Datei:** Über die Hilfsklasse `EventBus.js` werden diese Ereignisse in die Datei `sys_events.json` in diesem Verzeichnis geschrieben.
3. **Alerting:** Nachdem der Sync-Prozess abgeschlossen ist, wird `alert.js` gestartet.
4. **Verarbeitung:** `alert.js` liest die `sys_events.json` aus, verarbeitet die Events (z.B. per E-Mail-Benachrichtigung oder LLM-Analyse) und **löscht die Datei im Anschluss sofort wieder**.

So bleibt das System zu 100% entkoppelt, ohne dass die Datenbank mit Meta-Flags oder Log-Tabellen aufgebläht wird.
