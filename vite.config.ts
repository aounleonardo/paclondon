import { defineConfig } from 'vitest/config'

// Netlify / most hosts use '/'. Override with VITE_BASE_PATH=/pacman-on-map/ for GitHub Pages.
const base = process.env.VITE_BASE_PATH || '/'

export default defineConfig({
  base,
  server: {
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
})
