import type { Plugin } from 'vite'

export function apiPlugin(): Plugin {
  return {
    name: 'notes-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()
        try {
          const { handleApiRequest } = await server.ssrLoadModule('/src/server/api.ts')
          const handled = await handleApiRequest(req, res)
          if (!handled) next()
        } catch (err) {
          console.error('[api]', err)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: String(err) }))
        }
      })
    },
  }
}
