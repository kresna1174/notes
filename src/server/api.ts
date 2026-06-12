import type { IncomingMessage, ServerResponse } from 'node:http'
import { createReadStream } from 'node:fs'
import { db, sqlite } from '../lib/db'
import { notes, attachments, users } from '../../drizzle/schema'
import { desc, eq, and } from 'drizzle-orm'
import { ulid } from 'ulid'
import Busboy from 'busboy'
import { saveFile, getFilePath, deleteFile } from '../lib/storage'
import bcrypt from 'bcryptjs'

function getSession(req: IncomingMessage) {
  const cookie = req.headers.cookie || ''
  const match = cookie.match(/(?:^|;\s*)session=([^;]+)/)
  if (!match) return null
  const row = sqlite.prepare('SELECT user_id as userId, username, role FROM sessions WHERE token = ?').get(match[1]) as { userId: string; username: string; role: string } | undefined
  return row ?? null
}

function setSessionCookie(res: ServerResponse, token: string) {
  res.setHeader('Set-Cookie', `session=${token}; Path=/; HttpOnly; SameSite=Strict`)
}

function clearSessionCookie(res: ServerResponse) {
  res.setHeader('Set-Cookie', `session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`)
}

function json(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

function getUsernameById(userId: string | null | undefined): string | null {
  if (!userId) return null
  const row = sqlite.prepare('SELECT username FROM users WHERE id = ?').get(userId) as { username: string } | undefined
  return row?.username ?? null
}

function stripAndEnrich(note: Record<string, any>) {
  const { pinHash, sharePinHash, ...rest } = note
  return {
    ...rest,
    isLocked: !!pinHash,
    hasPinProtection: !!sharePinHash,
    createdByUsername: getUsernameById(rest.userId),
    updatedByUsername: getUsernameById(rest.updatedByUserId),
  }
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

  // POST /api/auth/login
  if (method === 'POST' && path === '/api/auth/login') {
    const body = await readBody(req)
    const { username, password } = body as { username?: string; password?: string }
    if (!username || !password) { json(res, { error: 'username and password required' }, 400); return true }
    const [user] = await db.select().from(users).where(eq(users.username, username))
    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
      json(res, { error: 'Invalid username or password' }, 401); return true
    }
    const token = ulid()
    sqlite.prepare('INSERT INTO sessions (token, user_id, username, role, created_at) VALUES (?, ?, ?, ?, ?)').run(token, user.id, user.username, user.role, Date.now())
    setSessionCookie(res, token)
    json(res, { userId: user.id, username: user.username, role: user.role })
    return true
  }

  // POST /api/auth/logout
  if (method === 'POST' && path === '/api/auth/logout') {
    const cookie = req.headers.cookie || ''
    const match = cookie.match(/(?:^|;\s*)session=([^;]+)/)
    if (match) sqlite.prepare('DELETE FROM sessions WHERE token = ?').run(match[1])
    clearSessionCookie(res)
    json(res, { ok: true })
    return true
  }

  // GET /api/auth/me
  if (method === 'GET' && path === '/api/auth/me') {
    const session = getSession(req)
    if (!session) { json(res, { error: 'unauthenticated' }, 401); return true }
    json(res, session)
    return true
  }

  // POST /api/auth/register (admin only)
  if (method === 'POST' && path === '/api/auth/register') {
    const session = getSession(req)
    if (!session || session.role !== 'admin') { json(res, { error: 'forbidden' }, 403); return true }
    const body = await readBody(req)
    const { username, password, role } = body as { username?: string; password?: string; role?: string }
    if (!username || !password) { json(res, { error: 'username and password required' }, 400); return true }
    const validRole = role === 'admin' ? 'admin' : 'viewer'
    const existing = sqlite.prepare('SELECT id FROM users WHERE username = ?').get(username)
    if (existing) { json(res, { error: 'username already exists' }, 409); return true }
    const hash = bcrypt.hashSync(password, 10)
    const id = ulid()
    await db.insert(users).values({ id, username, passwordHash: hash, role: validRole, createdAt: Date.now() })
    json(res, { id, username, role: validRole }, 201)
    return true
  }

  // GET /api/auth/users (admin only)
  if (method === 'GET' && path === '/api/auth/users') {
    const session = getSession(req)
    if (!session || session.role !== 'admin') { json(res, { error: 'forbidden' }, 403); return true }
    const all = await db.select({ id: users.id, username: users.username, role: users.role, createdAt: users.createdAt }).from(users)
    json(res, all)
    return true
  }

  // DELETE /api/auth/users/:id (admin only)
  const userMatch = path.match(/^\/api\/auth\/users\/([^/]+)$/)
  if (userMatch && method === 'DELETE') {
    const session = getSession(req)
    if (!session || session.role !== 'admin') { json(res, { error: 'forbidden' }, 403); return true }
    if (userMatch[1] === session.userId) { json(res, { error: 'cannot delete yourself' }, 400); return true }
    await db.delete(users).where(eq(users.id, userMatch[1]))
    json(res, { ok: true })
    return true
  }

  // protect all /api/notes and /api/attachments — require session
  if (path.startsWith('/api/notes') || path.startsWith('/api/attachments') || path.startsWith('/api/search')) {
    if (!getSession(req)) { json(res, { error: 'unauthenticated' }, 401); return true }
  }

  // GET /api/search?q=
  if (method === 'GET' && path === '/api/search') {
    const session = getSession(req)!
    const q = url.searchParams.get('q')?.trim()
    if (!q) { json(res, []); return true }

    const rows = session.role === 'admin'
      ? sqlite.prepare(`
          SELECT n.id, n.title, n.created_at as createdAt,
            snippet(notes_fts, 2, '<mark>', '</mark>', '...', 10) as snippet
          FROM notes_fts JOIN notes n ON n.id = notes_fts.id
          WHERE notes_fts MATCH ? ORDER BY rank LIMIT 50
        `).all(`${q}*`)
      : sqlite.prepare(`
          SELECT n.id, n.title, n.created_at as createdAt,
            snippet(notes_fts, 2, '<mark>', '</mark>', '...', 10) as snippet
          FROM notes_fts JOIN notes n ON n.id = notes_fts.id
          WHERE notes_fts MATCH ? AND n.user_id = ? ORDER BY rank LIMIT 50
        `).all(`${q}*`, session.userId)

    json(res, rows)
    return true
  }

  // GET /api/notes
  if (path === '/api/notes' && method === 'GET') {
    const session = getSession(req)!
    const all = session.role === 'admin'
      ? await db.select().from(notes).orderBy(desc(notes.createdAt))
      : await db.select().from(notes).where(eq(notes.userId, session.userId)).orderBy(desc(notes.createdAt))
    json(res, all.map(n => stripAndEnrich(n)))
    return true
  }

  // POST /api/notes
  if (path === '/api/notes' && method === 'POST') {
    const session = getSession(req)!
    const now = Date.now()
    const id = ulid()
    const note = { id, userId: session.userId, title: '', content: '{"type":"doc","content":[]}', createdAt: now, updatedAt: now }
    await db.insert(notes).values(note)
    json(res, note, 201)
    return true
  }

  // GET /api/share/:token — public, no auth
  const shareViewMatch = path.match(/^\/api\/share\/([^/]+)$/)
  if (shareViewMatch && method === 'GET') {
    const token = shareViewMatch[1]
    const row = sqlite.prepare('SELECT id, title, content, user_id as userId, updated_by_user_id as updatedByUserId, created_at as createdAt, updated_at as updatedAt, share_pin_hash as sharePinHash FROM notes WHERE share_token = ?').get(token) as { id: string; title: string; content: string; userId: string; updatedByUserId: string | null; createdAt: number; updatedAt: number; sharePinHash: string | null } | undefined
    if (!row) { json(res, { error: 'not found' }, 404); return true }
    const { sharePinHash, ...rest } = row
    json(res, {
      ...rest,
      hasPinProtection: !!sharePinHash,
      createdByUsername: getUsernameById(rest.userId),
      updatedByUsername: getUsernameById(rest.updatedByUserId),
    })
    return true
  }

  // POST /api/share/:token/verify — public pin verify
  const shareVerifyMatch = path.match(/^\/api\/share\/([^/]+)\/verify$/)
  if (shareVerifyMatch && method === 'POST') {
    const token = shareVerifyMatch[1]
    const row = sqlite.prepare('SELECT share_pin_hash as sharePinHash FROM notes WHERE share_token = ?').get(token) as { sharePinHash: string | null } | undefined
    if (!row) { json(res, { error: 'not found' }, 404); return true }
    if (!row.sharePinHash) { json(res, { ok: true }); return true }
    const body = await readBody(req)
    const { pin } = body as { pin?: string }
    if (!pin || !bcrypt.compareSync(pin, row.sharePinHash)) {
      json(res, { error: 'invalid pin' }, 401); return true
    }
    json(res, { ok: true })
    return true
  }

  // POST /api/notes/:id/share — create/update share link
  const shareManageMatch = path.match(/^\/api\/notes\/([^/]+)\/share$/)
  if (shareManageMatch && method === 'POST') {
    const id = shareManageMatch[1]
    const session = getSession(req)!
    const ownerFilter = session.role === 'admin'
      ? eq(notes.id, id)
      : and(eq(notes.id, id), eq(notes.userId, session.userId))
    const body = await readBody(req)
    const { pin } = body as { pin?: string }
    const token = ulid()
    const sharePinHash = pin ? bcrypt.hashSync(pin, 10) : null
    await db.update(notes).set({ shareToken: token, sharePinHash }).where(ownerFilter)
    json(res, { token, hasPinProtection: !!sharePinHash })
    return true
  }

  // DELETE /api/notes/:id/share — revoke share link
  if (shareManageMatch && method === 'DELETE') {
    const id = shareManageMatch[1]
    const session = getSession(req)!
    const ownerFilter = session.role === 'admin'
      ? eq(notes.id, id)
      : and(eq(notes.id, id), eq(notes.userId, session.userId))
    await db.update(notes).set({ shareToken: null, sharePinHash: null }).where(ownerFilter)
    json(res, { ok: true })
    return true
  }

  // PATCH /api/notes/:id/share — update share pin only
  if (shareManageMatch && method === 'PATCH') {
    const id = shareManageMatch[1]
    const session = getSession(req)!
    const ownerFilter = session.role === 'admin'
      ? eq(notes.id, id)
      : and(eq(notes.id, id), eq(notes.userId, session.userId))
    const body = await readBody(req)
    const { pin } = body as { pin?: string | null }
    const sharePinHash = pin ? bcrypt.hashSync(pin, 10) : null
    await db.update(notes).set({ sharePinHash }).where(ownerFilter)
    json(res, { ok: true, hasPinProtection: !!sharePinHash })
    return true
  }

  // PUT /api/notes/:id/pin — set pin
  const pinSetMatch = path.match(/^\/api\/notes\/([^/]+)\/pin$/)
  if (pinSetMatch && method === 'PUT') {
    const id = pinSetMatch[1]
    const session = getSession(req)!
    const ownerFilter = session.role === 'admin'
      ? eq(notes.id, id)
      : and(eq(notes.id, id), eq(notes.userId, session.userId))
    const body = await readBody(req)
    const { pin } = body as { pin?: string }
    if (!pin || !/^\d{4}$/.test(pin)) { json(res, { error: 'pin must be 4 digits' }, 400); return true }
    const hash = bcrypt.hashSync(pin, 10)
    await db.update(notes).set({ pinHash: hash }).where(ownerFilter)
    json(res, { ok: true })
    return true
  }

  // DELETE /api/notes/:id/pin — remove pin
  if (pinSetMatch && method === 'DELETE') {
    const id = pinSetMatch[1]
    const session = getSession(req)!
    const ownerFilter = session.role === 'admin'
      ? eq(notes.id, id)
      : and(eq(notes.id, id), eq(notes.userId, session.userId))
    const body = await readBody(req)
    const { pin } = body as { pin?: string }
    const [note] = await db.select().from(notes).where(ownerFilter)
    if (!note) { json(res, { error: 'not found' }, 404); return true }
    if (!note.pinHash || !pin || !bcrypt.compareSync(pin, note.pinHash)) {
      json(res, { error: 'invalid pin' }, 401); return true
    }
    await db.update(notes).set({ pinHash: null }).where(ownerFilter)
    json(res, { ok: true })
    return true
  }

  // POST /api/notes/:id/pin/verify — verify pin
  const pinVerifyMatch = path.match(/^\/api\/notes\/([^/]+)\/pin\/verify$/)
  if (pinVerifyMatch && method === 'POST') {
    const id = pinVerifyMatch[1]
    const session = getSession(req)!
    const ownerFilter = session.role === 'admin'
      ? eq(notes.id, id)
      : and(eq(notes.id, id), eq(notes.userId, session.userId))
    const body = await readBody(req)
    const { pin } = body as { pin?: string }
    const [note] = await db.select().from(notes).where(ownerFilter)
    if (!note) { json(res, { error: 'not found' }, 404); return true }
    if (!note.pinHash || !pin || !bcrypt.compareSync(pin, note.pinHash)) {
      json(res, { error: 'invalid pin' }, 401); return true
    }
    json(res, { ok: true })
    return true
  }

  // GET/PUT/DELETE /api/notes/:id
  const noteMatch = path.match(/^\/api\/notes\/([^/]+)$/)
  if (noteMatch) {
    const id = noteMatch[1]
    const session = getSession(req)!
    // ownership check: admin bypasses, viewer must own the note
    const ownerFilter = session.role === 'admin'
      ? eq(notes.id, id)
      : and(eq(notes.id, id), eq(notes.userId, session.userId))

    if (method === 'GET') {
      const [note] = await db.select().from(notes).where(ownerFilter)
      if (!note) { json(res, { error: 'not found' }, 404); return true }
      json(res, stripAndEnrich(note))
      return true
    }

    if (method === 'PUT') {
      const body = await readBody(req)
      const { title, content } = body as { title?: string; content?: string }
      await db.update(notes)
        .set({ ...(title !== undefined && { title }), ...(content !== undefined && { content }), updatedByUserId: session.userId, updatedAt: Date.now() })
        .where(ownerFilter)
      const [updated] = await db.select().from(notes).where(ownerFilter)
      if (!updated) { json(res, { error: 'not found' }, 404); return true }
      json(res, stripAndEnrich(updated))
      return true
    }

    if (method === 'DELETE') {
      await db.delete(notes).where(ownerFilter)
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
