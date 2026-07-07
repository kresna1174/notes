import type { Plugin } from 'vite'
import { WebSocketServer } from 'ws'

export function apiPlugin(): Plugin {
  const wss = new WebSocketServer({ noServer: true })

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

      if (server.httpServer) {
        console.log('[Dev WS] Attached upgrade listener to httpServer')
        server.httpServer.on('upgrade', async (request, socket, head) => {
          const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`)
          const pathname = url.pathname
          console.log('[Dev WS] Upgrade request received:', pathname)
          
          const match = pathname.match(/^\/api\/notes\/([^\/]+)\/collaboration\/([^\/]+)$/)
          if (match) {
            const noteId = match[1]
            console.log('[Dev WS] Match found for noteId:', noteId)
            try {
              const { verifySession, handleYjsConnection } = await server.ssrLoadModule('/src/server/yjs.ts')
              const cookieHeader = request.headers.cookie
              const isAuth = verifySession(cookieHeader)
              console.log('[Dev WS] verifySession result:', isAuth)
              
              if (!isAuth) {
                console.log('[Dev WS] Unauthorized - destroying socket')
                socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
                socket.destroy()
                return
              }
              
              console.log('[Dev WS] Upgrading connection via wss.handleUpgrade')
              wss.handleUpgrade(request, socket, head, (ws) => {
                console.log('[Dev WS] Upgrade complete, handling Yjs connection')
                handleYjsConnection(ws, noteId)
              })
            } catch (err) {
              console.error('[Yjs Dev WS upgrade error]', err)
              socket.destroy()
            }
          } else {
            console.log('[Dev WS] Path does not match Yjs upgrade pattern')
          }
        })
      } else {
        console.log('[Dev WS] server.httpServer is NULL!')
      }
    },
  }
}
