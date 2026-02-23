
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tfwnekfuqxpnezbjcbpj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRmd25la2Z1cXhwbmV6YmpjYnBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMjc0NTIsImV4cCI6MjA4NjkwMzQ1Mn0.ch2-x97es6j1grDvvzdMgALWpdroKgDVv-Gh7C2bQYw';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testQuery() {
    console.log('--- Testing query to leads ---');
    try {
        const { data, error } = await supabase
            .from('leads')
            .select('*')
            .limit(1);

        if (error) {
            console.log('Leads Error:', error.message);
        } else {
            console.log('Leads Success! Count:', data.length);
        }
    } catch (err) { console.error(err); }

    console.log('\n--- Testing query to profiles ---');
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .limit(1);

        if (error) {
            console.log('Profiles Error:', error.message);
        } else {
            console.log('Profiles Success! Count:', data.length);
        }
    } catch (err) { console.error(err); }

    console.log('\n--- Testing query to flujos_embudo ---');
    try {
        const { data, error } = await supabase
            .from('flujos_embudo')
            .select('*')
            .limit(1);

        if (error) {
            console.log('Flujos Error:', error.message);
        } else {
            console.log('Flujos Success! Data:', data[0] ? Object.keys(data[0]) : 'Empty table');
        }
    } catch (err) { console.error(err); }
}

testQuery();
