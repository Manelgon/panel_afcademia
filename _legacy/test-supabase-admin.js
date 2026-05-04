import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://tfwnekfuqxpnezbjcbpj.supabase.co'
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRmd25la2Z1cXhwbmV6YmpjYnBqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTMyNzQ1MiwiZXhwIjoyMDg2OTAzNDUyfQ.XLF8NSTZtfZpKHyk7ih3hyu-xWhREFQbU6clIw0z4X0'

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function test() {
    console.log('Testing connection with SERVICE_ROLE...')
    const { data, error } = await supabase.from('profiles').select('id, role').eq('email', 'afcademia@gmail.com').single()
    if (error) {
        console.error('Error fetching admin profile:', error)
    } else {
        console.log('Successfully fetched admin profile:', data)
    }
}

test()
