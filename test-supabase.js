import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://tfwnekfuqxpnezbjcbpj.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRmd25la2Z1cXhwbmV6YmpjYnBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMjc0NTIsImV4cCI6MjA4NjkwMzQ1Mn0.ch2-x97es6j1grDvvzdMgALWpdroKgDVv-Gh7C2bQYw'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function test() {
    console.log('Testing connection...')
    const { data, error } = await supabase.from('profiles').select('id, role').limit(1)
    if (error) {
        console.error('Error fetching profiles:', error)
    } else {
        console.log('Successfully fetched profiles:', data)
    }
}

test()
