
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tfwnekfuqxpnezbjcbpj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRmd25la2Z1cXhwbmV6YmpjYnBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMjc0NTIsImV4cCI6MjA4NjkwMzQ1Mn0.ch2-x97es6j1grDvvzdMgALWpdroKgDVv-Gh7C2bQYw';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCols() {
    const cols = ['status_actual', 'keyword_recibida', 'tags_proceso', 'actividad'];
    for (const col of cols) {
        const { error } = await supabase.from('flujos_embudo').select(col).limit(1);
        if (error) {
            console.log(`Column ${col}: ${error.message}`);
        } else {
            console.log(`Column ${col}: OK`);
        }
    }
}

checkCols();
