
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tfwnekfuqxpnezbjcbpj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRmd25la2Z1cXhwbmV6YmpjYnBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMjc0NTIsImV4cCI6MjA4NjkwMzQ1Mn0.ch2-x97es6j1grDvvzdMgALWpdroKgDVv-Gh7C2bQYw';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testSchema() {
    console.log('--- Checking flujos_embudo columns ---');
    const { data: cols, error: errCols } = await supabase.rpc('get_table_columns_v2', { t_name: 'flujos_embudo' });
    // Note: get_table_columns_v2 is likely not a standard RPC, so let's just select * and see keys

    const { data, error } = await supabase.from('flujos_embudo').select('*').limit(1);
    if (error) {
        console.log('Error selecting from flujos_embudo:', error.message);
    } else if (data && data.length > 0) {
        console.log('Columns in flujos_embudo:', Object.keys(data[0]).join(', '));
    } else {
        console.log('flujos_embudo is empty. Trying to insert a dummy to check columns...');
        // We can check if actividad exists by trying to select it specifically
        const { error: errSpec } = await supabase.from('flujos_embudo').select('actividad').limit(1);
        if (errSpec) {
            console.log('Column "actividad" DOES NOT exist:', errSpec.message);
        } else {
            console.log('Column "actividad" DOES exist.');
        }
    }
}

testSchema();
