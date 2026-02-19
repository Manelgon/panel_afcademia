import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),
    ],
    server: {
        proxy: {
            // Proxy all Supabase API requests through Vite dev server to avoid CORS
            '/rest': {
                target: 'https://ssdbss.automatizatelo.com',
                changeOrigin: true,
                secure: true,
            },
            '/auth': {
                target: 'https://ssdbss.automatizatelo.com',
                changeOrigin: true,
                secure: true,
            },
            '/realtime': {
                target: 'https://ssdbss.automatizatelo.com',
                changeOrigin: true,
                secure: true,
                ws: true, // WebSocket support for realtime
            },
            '/storage': {
                target: 'https://ssdbss.automatizatelo.com',
                changeOrigin: true,
                secure: true,
            },
        },
    },
})
