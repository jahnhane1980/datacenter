# Fahrplan, um diesen sauberen Zustand zu erreichen:

## 1. Lokal alles wegwerfen
Zuerst machen wir lokal reinen Tisch, stoppe die Container komplett: 
supabase stop --no-backup

* Lösche alle Dateien in deinem lokalen Ordner supabase/migrations/.
* Lösche den Inhalt deiner lokalen supabase/seed.sql (oder lösche die Datei komplett).

## 2. Remote das "Gedächtnis" löschen
Gehe ins Supabase Dashboard (SQL Editor) deines Remote-Projekts.

Führe aus: TRUNCATE supabase_migrations.schema_migrations;
(Damit hat Remote vergessen, welche Migrationsdateien jemals liefen. Deine Tabellen, Functions und Daten bleiben davon aber völlig unangetastet).

## 3. Lokal neu aufbauen & verlinken
1. Starte lokal neu: supabase start
2. Verlinke dich mit deinem Remote-Projekt: supabase link --project-ref <deine-project-ref>

## 4. Schema & Functions ziehen (Der Pull)
Jetzt holen wir uns das komplette Schema als eine einzige, frische Datei:

normalerweise
supabase db pull

wenn der host aufgrund von ipv4/6 Problematik nicht erkannt wird
supabase db pull --db-url "postgresql://postgres.PROJECT_ID:PASSWORT@aws-1-eu-central-2.pooler.supabase.com:6543/postgres"

Supabase erstellt in deinem ansonsten leeren migrations/-Ordner jetzt eine brandneue Datei (z. B. 20260612190000_remote_schema.sql). Diese enthält nun dein gesamtes aktuelles Schema inklusive aller Functions.

## 5. Den Sync fixen (WICHTIG!)
Wenn du jetzt irgendwann supabase db push ausführen würdest, würde Supabase versuchen, diese neue Datei auf Remote auszuführen – und crashen, weil die Tabellen dort ja schon existieren. Wir müssen Remote also sagen, dass diese neue Datei "schon erledigt" ist.

Kopiere den Timestamp (die Zahlenreihe ganz am Anfang) der gerade erstellten Migrationsdatei und führe das hier aus:

supabase migration repair --status applied <dein_timestamp>

## 6. Den Seed (Daten) ziehen
Da pull keine Daten holt, musst du dir den aktuellen Datenbestand für deinen Seed separat herunterladen. Das machst du mit einem Dump:

normal
supabase db dump --data-only > supabase/seed.sql

ipv4/v6 Problem
supabase db dump --data-only --db-url "postgresql://postgres.DEINE_PROJECT_ID:DEIN_FRISCHES_PASSWORT@aws-1-eu-central-2.pooler.supabase.com:6543/postgres" > supabase/seed.sql

## 7. Function herunterladen
supabase functions download 
 