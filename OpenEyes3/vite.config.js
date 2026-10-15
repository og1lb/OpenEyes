import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
    },
  },
  server: {
    port: 5180,
    proxy: {
      // `npm run server:dev` puts the backend on 8000. Proxying keeps the
      // whole thing on http://localhost:5180, so cookies are first-party and
      // the panel gets hot reload at the same time.
      '/api': {
        target: process.env.OPENEYES_API || 'http://127.0.0.1:8000',
        changeOrigin: false,
      },
    },
  },
})
