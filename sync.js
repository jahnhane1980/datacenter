import 'dotenv/config';
import { parseArgs } from 'util';
import { supabaseClient } from './src/core/SupabaseClient.js';
import { Router } from './src/core/Router.js';

async function main() {
    try {
        const { values } = parseArgs({
            options: {
                task: { type: 'string' },
                mode: { type: 'string', default: 'sync' }
            }
        });

        if (!values.task) {
            console.error('Fehler: Argument --task fehlt. Beispiel: node sync.js --task daily');
            process.exit(1);
        }

        const router = new Router(supabaseClient);
        await router.execute(values.task, values.mode);
        
        process.exit(0);
    } catch (error) {
        console.error('Kritischer Fehler:', error.message || error);
        process.exit(1);
    }
}

main();
