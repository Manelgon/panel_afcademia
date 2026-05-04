
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tfwnekfuqxpnezbjcbpj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRmd25la2Z1cXhwbmV6YmpjYnBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMjc0NTIsImV4cCI6MjA4NjkwMzQ1Mn0.ch2-x97es6j1grDvvzdMgALWpdroKgDVv-Gh7C2bQYw';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testAll() {
    const results = {};
    const tables = ['leads', 'flujos_embudo', 'segmentacion_despacho', 'profiles'];

    for (const table of tables) {
        const { data, error } = await supabase.from(table).select('*').limit(1);
        if (error) {
            results[table] = { error: error.message, code: error.code };
        } else {
            results[table] = { columns: data[0] ? Object.keys(data[0]) : 'Empty' };
        }
    }
    console.log('RESULTS_START');
    console.log(JSON.stringify(results, null, 2));
    console.log('RESULTS_END');
}

testAll();
