import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // VITE_BASE_PATH is injected by GitHub Actions as /<repo-name>/
  base: process.env.VITE_BASE_PATH || '/',
})
