import { createClient } from '@supabase/supabase-js'

const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || ''

// Always use relative URL (empty string) so requests go through the proxy:
// - DEV: Vite dev server proxy (vite.config.js)
// - PROD: Vercel rewrites (vercel.json)
// This completely avoids CORS issues with the self-hosted Supabase instance.
const supabaseUrl = ''

if (!supabaseAnonKey) {
    console.warn('Supabase ANON KEY no configurada. La aplicación podría fallar.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

