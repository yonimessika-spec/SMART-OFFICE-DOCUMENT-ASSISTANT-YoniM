import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev server for the front end. The Express proxy (server/) comes in a later
// step; when it exists, add a server.proxy entry mapping /api -> http://localhost:PORT.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
})
