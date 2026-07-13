import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Default to port 3000; Vite auto-increments (3001, 3002, ...) if it's in use.
    port: 3000,
    strictPort: false,
    // Proxy API calls to the Express server during local dev (`pnpm dev:api`).
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
})
