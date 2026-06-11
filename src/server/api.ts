import type { IncomingMessage, ServerResponse } from 'node:http'
import { db } from '../lib/db'
import { notes } from '../../drizzle/schema'
import { desc, eq, like, or } from 'drizzle-orm'
import { ulid } from 'ulid'

function json(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      try { resolve(JSON.parse(body || 'null')) } catch { reject(new Error('invalid json')) }
    })
    req.on('error', reject)
  })
}

export async function handleApiRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url!, `http://localhost`)
  const path = url.pathname
  const method = req.method?.toUpperCase() ?? 'GET'

  // GET /api/notes
  if (path === '/api/notes' && method === 'GET') {
    const all = await db.select().from(notes).orderBy(desc(notes.createdAt))
    json(res, all)
    return true
  }

  // POST /api/notes
  if (path === '/api/notes' && method === 'POST') {
    const now = Date.now()
    const id = ulid()
    const note = { id, title: '', content: '{"type":"doc","content":[]}', createdAt: now, updatedAt: now }
    await db.insert(notes).values(note)
    json(res, note, 201)
    return true
  }

  // GET/PUT/DELETE /api/notes/:id
  const noteMatch = path.match(/^\/api\/notes\/([^/]+)$/)
  if (noteMatch) {
    const id = noteMatch[1]

    if (method === 'GET') {
      const [note] = await db.select().from(notes).where(eq(notes.id, id))
      if (!note) { json(res, { error: 'not found' }, 404); return true }
      json(res, note)
      return true
    }

    if (method === 'PUT') {
      const body = await readBody(req)
      const { title, content } = body as { title?: string; content?: string }
      await db.update(notes)
        .set({ ...(title !== undefined && { title }), ...(content !== undefined && { content }), updatedAt: Date.now() })
        .where(eq(notes.id, id))
      const [updated] = await db.select().from(notes).where(eq(notes.id, id))
      if (!updated) return json(res, { error: 'not found' }, 404)
      json(res, updated)
      return true
    }

    if (method === 'DELETE') {
      await db.delete(notes).where(eq(notes.id, id))
      json(res, { ok: true })
      return true
    }
  }

  return false
}
