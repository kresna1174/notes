import { createServer } from 'http'
import { existsSync, createReadStream, statSync } from 'fs'
import { join, extname } from 'path'
import { handleApiRequest } from './src/server/api'
import { WebSocketServer } from 'ws'
import { verifySession, handleYjsConnection } from './src/server/yjs'

const PORT = process.env.PORT || 3000
const DIST_DIR = join(process.cwd(), 'dist')
const UPLOADS_DIR = join(process.cwd(), 'uploads')

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain',
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '', `http://localhost:${PORT}`)
  const pathname = url.pathname

  // 1. API Route
  if (pathname.startsWith('/api/')) {
    try {
      const handled = await handleApiRequest(req, res)
      if (handled) return
    } catch (err) {
      console.error('[server error]', err)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Internal Server Error' }))
      return
    }
  }

  // 2. Uploads Static Route
  if (pathname.startsWith('/uploads/')) {
    const filename = pathname.replace(/^\/uploads\//, '')
    const filePath = join(UPLOADS_DIR, decodeURIComponent(filename))
    
    // Safety check: ensure file is inside UPLOADS_DIR to prevent directory traversal
    if (filePath.startsWith(UPLOADS_DIR) && existsSync(filePath) && statSync(filePath).isFile()) {
      const ext = extname(filePath).toLowerCase()
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000',
      })
      createReadStream(filePath).pipe(res)
      return
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('404 Not Found')
      return
    }
  }

  // 3. Frontend Static Assets
  let targetPath = join(DIST_DIR, pathname)
  
  // SPA fallback for HTML5 routing
  let isFile = existsSync(targetPath) && statSync(targetPath).isFile()
  if (!isFile) {
    targetPath = join(DIST_DIR, 'index.html')
    isFile = existsSync(targetPath) && statSync(targetPath).isFile()
  }

  if (isFile) {
    const ext = extname(targetPath).toLowerCase()
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000',
    })
    createReadStream(targetPath).pipe(res)
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('404 Not Found')
  }
})

const wss = new WebSocketServer({ noServer: true })

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`)
  const pathname = url.pathname
  const match = pathname.match(/^\/api\/notes\/([^\/]+)\/collaboration\/([^\/]+)$/)
  
  if (match) {
    const noteId = match[1]
    const cookieHeader = request.headers.cookie
    if (!verifySession(cookieHeader)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, noteId)
    })
  } else {
    socket.destroy()
  }
})

wss.on('connection', (ws: any, _request: any, noteId: any) => {
  handleYjsConnection(ws, noteId as string)
})

server.listen(PORT, () => {
  console.log(`Server running in production on port ${PORT}`)
})
