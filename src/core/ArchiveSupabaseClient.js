import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_ARCHIVE_PROJECT_ID = process.env.SUPABASE_ARCHIVE_PROJECT_ID;
const SUPABASE_ARCHIVE_SECRET_KEY = process.env.SUPABASE_ARCHIVE_SECRET_KEY;

if (!SUPABASE_ARCHIVE_PROJECT_ID || !SUPABASE_ARCHIVE_SECRET_KEY) {
    console.warn('WARNUNG: Supabase Archive Credentials fehlen in den Umgebungsvariablen!');
}

const SUPABASE_ARCHIVE_URL = `https://${SUPABASE_ARCHIVE_PROJECT_ID}.supabase.co`;

export const archiveSupabaseClient = createClient(SUPABASE_ARCHIVE_URL, SUPABASE_ARCHIVE_SECRET_KEY);
