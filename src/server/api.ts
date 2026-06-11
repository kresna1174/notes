import type { IncomingMessage, ServerResponse } from 'node:http'
import { createReadStream } from 'node:fs'
import { db, sqlite } from '../lib/db'
import { notes, attachments } from '../../drizzle/schema'
import { desc, eq } from 'drizzle-orm'
import { ulid } from 'ulid'
import Busboy from 'busboy'
import { saveFile, getFilePath, deleteFile } from '../lib/storage'

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

  // GET /api/search?q=
  if (method === 'GET' && path === '/api/search') {
    const q = url.searchParams.get('q')?.trim()
    if (!q) { json(res, []); return true }

    const rows = sqlite.prepare(`
      SELECT n.id, n.title, n.created_at as createdAt,
        snippet(notes_fts, 2, '<mark>', '</mark>', '...', 10) as snippet
      FROM notes_fts
      JOIN notes n ON n.id = notes_fts.id
      WHERE notes_fts MATCH ?
      ORDER BY rank
      LIMIT 50
    `).all(`${q}*`)

    json(res, rows)
    return true
  }

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

  // POST /api/attachments
  if (method === 'POST' && path === '/api/attachments') {
    const bb = Busboy({ headers: req.headers as Record<string, string | string[]> })
    let fileBuffer: Buffer | null = null
    let filename = ''
    let mimetype = ''
    let noteId = ''

    await new Promise<void>((resolve, reject) => {
      bb.on('file', (_name, file, info) => {
        const chunks: Buffer[] = []
        filename = info.filename
        mimetype = info.mimeType
        file.on('data', (chunk: Buffer) => chunks.push(chunk))
        file.on('end', () => { fileBuffer = Buffer.concat(chunks) })
      })
      bb.on('field', (name, val) => {
        if (name === 'noteId') noteId = val
      })
      bb.on('finish', resolve)
      bb.on('error', reject)
      req.pipe(bb)
    })

    if (!fileBuffer || !noteId) { json(res, { error: 'missing file or noteId' }, 400); return true }

    const record = {
      id: ulid(),
      noteId,
      filename,
      storedAs: saveFile(fileBuffer, filename),
      mimeType: mimetype || 'application/octet-stream',
      size: (fileBuffer as Buffer).length,
      createdAt: Date.now(),
    }
    await db.insert(attachments).values(record)
    json(res, record, 201)
    return true
  }

  // GET /api/attachments/:id
  const attachMatch = path.match(/^\/api\/attachments\/([^/]+)$/)
  if (attachMatch) {
    const id = attachMatch[1]

    if (method === 'GET') {
      const [att] = await db.select().from(attachments).where(eq(attachments.id, id))
      if (!att) { json(res, { error: 'not found' }, 404); return true }
      const filePath = getFilePath(att.storedAs)
      res.writeHead(200, {
        'Content-Type': att.mimeType,
        'Content-Disposition': `attachment; filename="${att.filename.replace(/"/g, '\\"')}"`,
        'Content-Length': att.size,
      })
      const stream = createReadStream(filePath)
      stream.on('error', () => {
        res.writeHead(404)
        res.end(JSON.stringify({ error: 'file not found on disk' }))
      })
      stream.pipe(res)
      return true
    }

    if (method === 'DELETE') {
      const [att] = await db.select().from(attachments).where(eq(attachments.id, id))
      if (!att) { json(res, { error: 'not found' }, 404); return true }
      deleteFile(att.storedAs)
      await db.delete(attachments).where(eq(attachments.id, id))
      json(res, { ok: true })
      return true
    }
  }

  return false
}
