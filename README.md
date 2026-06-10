
Installtion Antigravity CLI
irm https://antigravity.google/cli/install.ps1 | iex

AGENTS.md
=> coding anweisungen

.agents\settings.json
Timeout etcs. 

Starten
> agy 

komplexe Aufgaben
/model gemini-3.1-pro

schnelle, einfache Aufgaben
/model gemini-3.5-flash

SUPABASE
supabase login (login in Browser)
supabase link --project-ref dein-projekt-id (ersetzen) 
>> Docker starten 
supabase db pull

supabase start

Einzelne Befehle 
supabase functions download 

SEED holen
supabase db dump --data-only > supabase/seed.sql

migrations gedächtis von supabse löschen:
TRUNCATE supabase_migrations.schema_migrations;

Container aus, alle lokalen Datenbank-Daten werden unwiderruflich gelöscht
supabase stop --no-backup

Normales stoppen, ohne Daten löschen
supabase stop


Archivieren von m5 
node sync.js --task m5 --mode archive


  │ "Hi! Wir arbeiten an meinem datacenter-Projekt. Bitte lies dir als erstes die Datei  C:\GitHub\datacenter\FINANCEOS_TODO.md     
  │ durch, damit du wieder zu 100% im Kontext bist, und lass uns dann genau dort weitermachen." 