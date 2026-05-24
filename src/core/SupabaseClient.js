import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_PROJECT_ID = process.env.SUPABASE_PROJECT_ID;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_PROJECT_ID || !SUPABASE_SECRET_KEY) {
    console.warn('WARNUNG: Supabase Credentials fehlen in den Umgebungsvariablen!');
}

const SUPABASE_URL = `https://${SUPABASE_PROJECT_ID}.supabase.co`;

export const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);