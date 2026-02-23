
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tfwnekfuqxpnezbjcbpj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRmd25la2Z1cXhwbmV6YmpjYnBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMjc0NTIsImV4cCI6MjA4NjkwMzQ1Mn0.ch2-x97es6j1grDvvzdMgALWpdroKgDVv-Gh7C2bQYw';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testProfiles() {
    console.log('--- Checking profiles columns ---');
    const { data, error } = await supabase.from('profiles').select('*').limit(1);
    if (error) {
        console.log('Profiles Error:', error.message);
    } else if (data && data.length > 0) {
        console.log('Columns in profiles:', Object.keys(data[0]).join(', '));
    } else {
        console.log('profiles is empty.');
    }
}

testProfiles();
