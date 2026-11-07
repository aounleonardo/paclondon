import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

// Netlify / most hosts use '/'. Override with VITE_BASE_PATH=/pacman-on-map/ for GitHub Pages.
const base = process.env.VITE_BASE_PATH || '/'

/** Serve Netlify borough API routes from public/ files during `npm run dev`. */
function boroughApiDevPlugin(): Plugin {
  return {
    name: 'borough-api-dev',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? '').split('?')[0]
        const mazeMatch = pathname.match(/^\/api\/borough\/([^/]+)\/maze$/)
        if (mazeMatch) {
          const boroughId = decodeURIComponent(mazeMatch[1])
          const file = path.join(server.config.root, 'public', 'mazes', `${boroughId}.json`)
          if (fs.existsSync(file)) {
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(fs.readFileSync(file, 'utf8'))
            return
          }
        }
        const vacantMatch = pathname.match(/^\/api\/borough\/([^/]+)\/vacant-houses$/)
        if (vacantMatch) {
          const boroughId = decodeURIComponent(vacantMatch[1])
          const candidates = [
            path.join(server.config.root, 'public', `${boroughId}-vacant-houses.json`),
            path.join(server.config.root, 'public', 'vacant-houses.json'),
          ]
          for (const file of candidates) {
            if (fs.existsSync(file)) {
              res.statusCode = 200
              res.setHeader('Content-Type', 'application/json')
              res.end(fs.readFileSync(file, 'utf8'))
              return
            }
          }
        }
        next()
      })
    },
  }
}

export default defineConfig({
  base,
  plugins: [boroughApiDevPlugin()],
  server: {
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
})
