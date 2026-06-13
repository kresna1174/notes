import type { IncomingMessage, ServerResponse } from 'node:http'
import { createReadStream } from 'node:fs'
import { db, sqlite } from '../lib/db'
import { notes, attachments, users, teams } from '../../drizzle/schema'
import { desc, eq, and, sql } from 'drizzle-orm'
import { randomUUID } from 'crypto'
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

async function getOwnerFilter(id: string, userId: string, role: string) {
  const [sessionUser] = await db.select({ teamId: users.teamId }).from(users).where(eq(users.id, userId))
  const userTeamId = sessionUser?.teamId ?? null
  return role === 'admin'
    ? eq(notes.id, id)
    : userTeamId
      ? and(eq(notes.id, id), sql`(${notes.userId} = ${userId} OR (${notes.type} = 'team' AND ${notes.teamId} = ${userTeamId}))`)
      : and(eq(notes.id, id), eq(notes.userId, userId))
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
    if (user.status === 'pending') {
      json(res, { error: 'Akun Anda sedang menunggu persetujuan admin.' }, 403); return true
    }
    if (user.status === 'rejected') {
      json(res, { error: 'Pendaftaran akun Anda ditolak oleh admin.' }, 403); return true
    }
    const token = randomUUID()
    sqlite.prepare('INSERT INTO sessions (token, user_id, username, role, created_at) VALUES (?, ?, ?, ?, ?)').run(token, user.id, user.username, user.role, Date.now())
    setSessionCookie(res, token)
    json(res, { userId: user.id, username: user.username, role: user.role, teamId: user.teamId })
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
    const [me] = await db.select({ teamId: users.teamId }).from(users).where(eq(users.id, session.userId))
    json(res, { ...session, teamId: me?.teamId ?? null })
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
    const cleanUsername = username.trim()
    const existing = sqlite.prepare('SELECT id FROM users WHERE username = ?').get(cleanUsername)
    if (existing) { json(res, { error: 'username already exists' }, 409); return true }
    const hash = bcrypt.hashSync(password, 10)
    const id = randomUUID()
    await db.insert(users).values({ id, username: cleanUsername, passwordHash: hash, role: validRole, status: 'approved', createdAt: Date.now() })
    json(res, { id, username: cleanUsername, role: validRole }, 201)
    return true
  }

  // POST /api/auth/public-register (public registration)
  if (method === 'POST' && path === '/api/auth/public-register') {
    const body = await readBody(req)
    const { username, password } = body as { username?: string; password?: string }
    if (!username || !password) { json(res, { error: 'username and password required' }, 400); return true }
    const cleanUsername = username.trim()
    if (!cleanUsername) { json(res, { error: 'username cannot be empty' }, 400); return true }
    const existing = sqlite.prepare('SELECT id FROM users WHERE username = ?').get(cleanUsername)
    if (existing) { json(res, { error: 'Username sudah digunakan' }, 409); return true }
    const hash = bcrypt.hashSync(password, 10)
    const id = randomUUID()
    await db.insert(users).values({ id, username: cleanUsername, passwordHash: hash, role: 'viewer', status: 'pending', createdAt: Date.now() })
    json(res, { id, username: cleanUsername, status: 'pending' }, 201)
    return true
  }

  // GET /api/auth/users (admin only)
  if (method === 'GET' && path === '/api/auth/users') {
    const session = getSession(req)
    if (!session || session.role !== 'admin') { json(res, { error: 'forbidden' }, 403); return true }
    const all = await db.select({ 
      id: users.id, 
      username: users.username, 
      role: users.role, 
      teamId: users.teamId, 
      status: users.status, 
      createdAt: users.createdAt 
    }).from(users)
    json(res, all)
    return true
  }

  // PUT /api/auth/users/:id/approve (admin only)
  const approveMatch = path.match(/^\/api\/auth\/users\/([^/]+)\/approve$/)
  if (approveMatch && method === 'PUT') {
    const session = getSession(req)
    if (!session || session.role !== 'admin') { json(res, { error: 'forbidden' }, 403); return true }
    const userId = approveMatch[1]
    await db.update(users).set({ status: 'approved' }).where(eq(users.id, userId))
    json(res, { ok: true })
    return true
  }

  // PUT /api/auth/users/:id/reject (admin only)
  const rejectMatch = path.match(/^\/api\/auth\/users\/([^/]+)\/reject$/)
  if (rejectMatch && method === 'PUT') {
    const session = getSession(req)
    if (!session || session.role !== 'admin') { json(res, { error: 'forbidden' }, 403); return true }
    const userId = rejectMatch[1]
    await db.update(users).set({ status: 'rejected' }).where(eq(users.id, userId))
    json(res, { ok: true })
    return true
  }

  // GET /api/teams
  if (method === 'GET' && path === '/api/teams') {
    const session = getSession(req)
    if (!session) { json(res, { error: 'unauthenticated' }, 401); return true }
    const all = await db.select().from(teams).orderBy(teams.name)
    json(res, all)
    return true
  }

  // POST /api/teams (admin only)
  if (method === 'POST' && path === '/api/teams') {
    const session = getSession(req)
    if (!session || session.role !== 'admin') { json(res, { error: 'forbidden' }, 403); return true }
    const body = await readBody(req)
    const { name, description } = body as { name?: string; description?: string }
    if (!name?.trim()) { json(res, { error: 'name required' }, 400); return true }
    const id = randomUUID()
    await db.insert(teams).values({ id, name: name.trim(), description: description?.trim() ?? null, createdAt: Date.now() })
    json(res, { id, name, description }, 201)
    return true
  }

  // team by id routes
  const teamMatch = path.match(/^\/api\/teams\/([^/]+)$/)
  if (teamMatch) {
    const session = getSession(req)
    if (!session || session.role !== 'admin') { json(res, { error: 'forbidden' }, 403); return true }
    const teamId = teamMatch[1]

    if (method === 'PUT') {
      const body = await readBody(req)
      const { name, description } = body as { name?: string; description?: string }
      if (!name?.trim()) { json(res, { error: 'name required' }, 400); return true }
      await db.update(teams).set({ name: name.trim(), description: description?.trim() ?? null }).where(eq(teams.id, teamId))
      json(res, { ok: true })
      return true
    }

    if (method === 'DELETE') {
      await db.update(users).set({ teamId: null }).where(eq(users.teamId, teamId))
      await db.delete(teams).where(eq(teams.id, teamId))
      json(res, { ok: true })
      return true
    }
  }

  // PUT /api/teams/:id/members/:userId — assign user to team (admin only)
  const teamMemberMatch = path.match(/^\/api\/teams\/([^/]+)\/members\/([^/]+)$/)
  if (teamMemberMatch && method === 'PUT') {
    const session = getSession(req)
    if (!session || session.role !== 'admin') { json(res, { error: 'forbidden' }, 403); return true }
    const [, teamId, userId] = teamMemberMatch
    await db.update(users).set({ teamId }).where(eq(users.id, userId))
    json(res, { ok: true })
    return true
  }

  // DELETE /api/teams/:id/members/:userId — remove user from team (admin only)
  if (teamMemberMatch && method === 'DELETE') {
    const session = getSession(req)
    if (!session || session.role !== 'admin') { json(res, { error: 'forbidden' }, 403); return true }
    const [,, userId] = teamMemberMatch
    await db.update(users).set({ teamId: null }).where(eq(users.id, userId))
    json(res, { ok: true })
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
    const scope = url.searchParams.get('scope') // 'mine' | 'team' | null (all)

    // get current user's teamId
    const [me] = await db.select({ teamId: users.teamId }).from(users).where(eq(users.id, session.userId))
    const myTeamId = me?.teamId ?? null

    let allNotes: any[] = [];
    if (session.role === 'admin') {
      if (scope === 'mine') {
        allNotes = await db.select().from(notes).where(eq(notes.type, 'individual')).orderBy(desc(notes.createdAt))
      } else if (scope === 'team') {
        allNotes = await db.select().from(notes).where(eq(notes.type, 'team')).orderBy(desc(notes.createdAt))
      } else {
        allNotes = await db.select().from(notes).orderBy(desc(notes.createdAt))
      }
    } else {
      if (scope === 'mine') {
        allNotes = await db.select().from(notes).where(and(eq(notes.userId, session.userId), eq(notes.type, 'individual'))).orderBy(desc(notes.createdAt))
      } else if (scope === 'team' && myTeamId) {
        allNotes = await db.select().from(notes).where(and(eq(notes.teamId, myTeamId), eq(notes.type, 'team'))).orderBy(desc(notes.createdAt))
      } else if (scope === 'team') {
        allNotes = []
      } else {
        // default: own individual notes only
        allNotes = await db.select().from(notes).where(and(eq(notes.userId, session.userId), eq(notes.type, 'individual'))).orderBy(desc(notes.createdAt))
      }
    }

    json(res, allNotes.map(n => stripAndEnrich(n)))
    return true
  }

  // GET /api/daily-log?date=YYYY-MM-DD
  if (path === '/api/daily-log' && method === 'GET') {
    const session = getSession(req)!
    const dateStr = url.searchParams.get('date')
    if (!dateStr) { json(res, { error: 'date required' }, 400); return true }
    const title = `[Daily] ${dateStr}`
    const [existing] = await db.select().from(notes).where(and(eq(notes.userId, session.userId), eq(notes.title, title)))
    if (existing) { json(res, stripAndEnrich(existing)); return true }
    const d = new Date(`${dateStr}T00:00:00`)
    const formatted = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    const content = JSON.stringify({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: `Daily Log - ${formatted}` }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Timeline' }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [] }] }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Catatan' }] },
        { type: 'paragraph', content: [] },
      ],
    })
    const id = randomUUID()
    const now = Date.now()
    const note = { id, userId: session.userId, teamId: null, type: 'individual' as const, title, content, createdAt: now, updatedAt: now }
    await db.insert(notes).values(note)
    json(res, stripAndEnrich(note), 201)
    return true
  }

  // POST /api/notes
  if (path === '/api/notes' && method === 'POST') {
    const session = getSession(req)!
    const body = await readBody(req) as { teamId?: string | null; type?: 'individual' | 'team' | null } | null
    const teamId = body?.teamId ?? null
    const type = body?.type || (teamId ? 'team' : 'individual')
    const now = Date.now()
    const id = randomUUID()
    const note = { id, userId: session.userId, teamId, type, title: '', content: '{"type":"doc","content":[]}', createdAt: now, updatedAt: now }
    await db.insert(notes).values(note)
    json(res, stripAndEnrich(note), 201)
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
    const ownerFilter = await getOwnerFilter(id, session.userId, session.role)
    const body = await readBody(req)
    const { pin } = body as { pin?: string }
    const token = randomUUID()
    const sharePinHash = pin ? bcrypt.hashSync(pin, 10) : null
    await db.update(notes).set({ shareToken: token, sharePinHash }).where(ownerFilter)
    json(res, { token, hasPinProtection: !!sharePinHash })
    return true
  }

  // DELETE /api/notes/:id/share — revoke share link
  if (shareManageMatch && method === 'DELETE') {
    const id = shareManageMatch[1]
    const session = getSession(req)!
    const ownerFilter = await getOwnerFilter(id, session.userId, session.role)
    await db.update(notes).set({ shareToken: null, sharePinHash: null }).where(ownerFilter)
    json(res, { ok: true })
    return true
  }

  // PATCH /api/notes/:id/share — update share pin only
  if (shareManageMatch && method === 'PATCH') {
    const id = shareManageMatch[1]
    const session = getSession(req)!
    const ownerFilter = await getOwnerFilter(id, session.userId, session.role)
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
    const ownerFilter = await getOwnerFilter(id, session.userId, session.role)
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
    const ownerFilter = await getOwnerFilter(id, session.userId, session.role)
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
    const ownerFilter = await getOwnerFilter(id, session.userId, session.role)
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

  // POST /api/notes/:id/copy-to-team
  const copyTeamMatch = path.match(/^\/api\/notes\/([^/]+)\/copy-to-team$/)
  if (copyTeamMatch && method === 'POST') {
    const id = copyTeamMatch[1]
    const session = getSession(req)!
    
    const [sessionUser] = await db.select({ teamId: users.teamId }).from(users).where(eq(users.id, session.userId))
    const userTeamId = sessionUser?.teamId ?? null
    if (!userTeamId) { json(res, { error: 'Anda belum tergabung dalam tim' }, 400); return true }

    const ownerFilter = await getOwnerFilter(id, session.userId, session.role)
    const [note] = await db.select().from(notes).where(ownerFilter)
    if (!note) { json(res, { error: 'Catatan tidak ditemukan atau Anda tidak memiliki akses' }, 404); return true }

    // Check if already copied to team (child copy exists in the target team)
    const [existingChild] = await db.select().from(notes).where(
      and(
        eq(notes.copiedFromId, id),
        eq(notes.teamId, userTeamId),
        eq(notes.type, 'team')
      )
    )

    // Check if this note was copied from a team note that still exists in the target team
    let existingParent = null
    if (note.copiedFromId) {
      const [parent] = await db.select().from(notes).where(
        and(
          eq(notes.id, note.copiedFromId),
          eq(notes.teamId, userTeamId),
          eq(notes.type, 'team')
        )
      )
      existingParent = parent
    }

    if (existingChild || existingParent) {
      json(res, { error: 'Catatan ini sudah ada di ruang kerja Tim (sudah pernah disalin dan masih ada di target)' }, 400)
      return true
    }

    const body = await readBody(req).catch(() => ({})) as { pin?: string | null }
    const { pin } = body || {}
    let customPinHash = note.pinHash
    if (pin !== undefined) {
      customPinHash = pin ? bcrypt.hashSync(pin, 10) : null
    }

    const now = Date.now()
    const newId = randomUUID()
    await db.insert(notes).values({
      id: newId,
      userId: session.userId,
      teamId: userTeamId,
      copiedFromId: id,
      type: 'team',
      title: `${session.username}: ${note.title || 'Catatan Tanpa Judul'}`,
      content: note.content,
      pinHash: customPinHash,
      createdAt: now,
      updatedAt: now
    })

    json(res, { ok: true, id: newId }, 201)
    return true
  }

  // POST /api/notes/:id/move-to-team
  const moveTeamMatch = path.match(/^\/api\/notes\/([^/]+)\/move-to-team$/)
  if (moveTeamMatch && method === 'POST') {
    const id = moveTeamMatch[1]
    const session = getSession(req)!

    const [sessionUser] = await db.select({ teamId: users.teamId }).from(users).where(eq(users.id, session.userId))
    const userTeamId = sessionUser?.teamId ?? null
    if (!userTeamId) { json(res, { error: 'Anda belum tergabung dalam tim' }, 400); return true }

    const ownerFilter = await getOwnerFilter(id, session.userId, session.role)
    const [note] = await db.select().from(notes).where(ownerFilter)
    if (!note) { json(res, { error: 'Catatan tidak ditemukan atau Anda tidak memiliki akses' }, 404); return true }

    const body = await readBody(req).catch(() => ({})) as { pin?: string | null }
    const { pin } = body || {}
    let customPinHash = note.pinHash
    if (pin !== undefined) {
      customPinHash = pin ? bcrypt.hashSync(pin, 10) : null
    }

    await db.update(notes)
      .set({ 
        type: 'team', 
        teamId: userTeamId, 
        title: `${session.username}: ${note.title || 'Catatan Tanpa Judul'}`,
        pinHash: customPinHash,
        updatedAt: Date.now() 
      })
      .where(eq(notes.id, id))

    json(res, { ok: true })
    return true
  }

  // POST /api/notes/:id/copy-to-personal
  const copyPersonalMatch = path.match(/^\/api\/notes\/([^/]+)\/copy-to-personal$/)
  if (copyPersonalMatch && method === 'POST') {
    const id = copyPersonalMatch[1]
    const session = getSession(req)!

    const ownerFilter = await getOwnerFilter(id, session.userId, session.role)
    const [note] = await db.select().from(notes).where(ownerFilter)
    if (!note) { json(res, { error: 'Catatan tidak ditemukan atau Anda tidak memiliki akses' }, 404); return true }

    // Check if already copied to personal (child copy exists in the target personal workspace)
    const [existingChild] = await db.select().from(notes).where(
      and(
        eq(notes.copiedFromId, id),
        eq(notes.userId, session.userId),
        eq(notes.type, 'individual')
      )
    )

    // Check if this note was copied from a personal note that still exists in the target personal workspace
    let existingParent = null
    if (note.copiedFromId) {
      const [parent] = await db.select().from(notes).where(
        and(
          eq(notes.id, note.copiedFromId),
          eq(notes.userId, session.userId),
          eq(notes.type, 'individual')
        )
      )
      existingParent = parent
    }

    if (existingChild || existingParent) {
      json(res, { error: 'Catatan ini sudah ada di ruang kerja Saya (sudah pernah disalin dan masih ada di target)' }, 400)
      return true
    }

    let teamName = 'Tim'
    if (note.teamId) {
      const [team] = await db.select({ name: teams.name }).from(teams).where(eq(teams.id, note.teamId))
      if (team?.name) teamName = team.name
    }

    const now = Date.now()
    const newId = randomUUID()
    await db.insert(notes).values({
      id: newId,
      userId: session.userId,
      teamId: null,
      copiedFromId: id,
      type: 'individual',
      title: `${teamName}: ${note.title || 'Catatan Tanpa Judul'}`,
      content: note.content,
      pinHash: note.pinHash,
      createdAt: now,
      updatedAt: now
    })

    json(res, { ok: true, id: newId }, 201)
    return true
  }

  // POST /api/notes/:id/move-to-personal
  const movePersonalMatch = path.match(/^\/api\/notes\/([^/]+)\/move-to-personal$/)
  if (movePersonalMatch && method === 'POST') {
    const id = movePersonalMatch[1]
    const session = getSession(req)!

    const ownerFilter = await getOwnerFilter(id, session.userId, session.role)
    const [note] = await db.select().from(notes).where(ownerFilter)
    if (!note) { json(res, { error: 'Catatan tidak ditemukan atau Anda tidak memiliki akses' }, 404); return true }

    let teamName = 'Tim'
    if (note.teamId) {
      const [team] = await db.select({ name: teams.name }).from(teams).where(eq(teams.id, note.teamId))
      if (team?.name) teamName = team.name
    }

    await db.update(notes)
      .set({ 
        type: 'individual', 
        teamId: null, 
        userId: session.userId, 
        title: `${teamName}: ${note.title || 'Catatan Tanpa Judul'}`,
        updatedAt: Date.now() 
      })
      .where(eq(notes.id, id))

    json(res, { ok: true })
    return true
  }

  // GET/PUT/DELETE /api/notes/:id
  const noteMatch = path.match(/^\/api\/notes\/([^/]+)$/)
  if (noteMatch) {
    const id = noteMatch[1]
    const session = getSession(req)!
    const ownerFilter = await getOwnerFilter(id, session.userId, session.role)

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
      id: randomUUID(),
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

  // GET /api/attachments/:id/inline — serve image inline (no download)
  const attachInlineMatch = path.match(/^\/api\/attachments\/([^/]+)\/inline$/)
  if (attachInlineMatch && method === 'GET') {
    const id = attachInlineMatch[1]
    const [att] = await db.select().from(attachments).where(eq(attachments.id, id))
    if (!att) { json(res, { error: 'not found' }, 404); return true }
    const filePath = getFilePath(att.storedAs)
    res.writeHead(200, { 'Content-Type': att.mimeType, 'Content-Length': att.size })
    const stream = createReadStream(filePath)
    stream.on('error', () => { res.writeHead(404); res.end() })
    stream.pipe(res)
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

  // GET /api/ai/chat/history/:id
  const historyMatch = path.match(/^\/api\/ai\/chat\/history\/([^/]+)$/)
  if (historyMatch && method === 'GET') {
    const session = getSession(req)
    if (!session) { json(res, { error: 'unauthenticated' }, 401); return true }
    try {
      const sessionId = historyMatch[1]
      const forwardRes = await fetch(`http://localhost:8000/api/chat/history/${sessionId}`)
      if (!forwardRes.ok) {
        const errText = await forwardRes.text()
        json(res, { error: `AI service error: ${errText}` }, forwardRes.status)
        return true
      }
      const data = await forwardRes.json()
      json(res, data)
    } catch (err) {
      json(res, { error: `Failed to communicate with AI agent: ${String(err)}` }, 500)
    }
    return true
  }

  // POST /api/ai/chat/stream
  if (method === 'POST' && path === '/api/ai/chat/stream') {
    const session = getSession(req)
    if (!session) { json(res, { error: 'unauthenticated' }, 401); return true }
    try {
      const body = await readBody(req) as any
      body.user_id = session.userId
      const forwardRes = await fetch('http://localhost:8000/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      if (!forwardRes.ok) {
        const errText = await forwardRes.text()
        json(res, { error: `AI service error: ${errText}` }, forwardRes.status)
        return true
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'x-vercel-ai-ui-stream-event': 'v1',
      })

      const reader = forwardRes.body?.getReader()
      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          res.write(value)
        }
      }
      res.end()
    } catch (err) {
      json(res, { error: `Failed to communicate with AI agent: ${String(err)}` }, 500)
    }
    return true
  }

  // POST /api/ai/chat
  if (method === 'POST' && path === '/api/ai/chat') {
    const session = getSession(req)
    if (!session) { json(res, { error: 'unauthenticated' }, 401); return true }
    try {
      const body = await readBody(req) as any
      body.user_id = session.userId
      const forwardRes = await fetch('http://localhost:8000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!forwardRes.ok) {
        const errText = await forwardRes.text()
        json(res, { error: `AI service error: ${errText}` }, forwardRes.status)
        return true
      }
      const data = await forwardRes.json()
      json(res, data)
    } catch (err) {
      json(res, { error: `Failed to communicate with AI agent: ${String(err)}` }, 500)
    }
    return true
  }

  // POST /api/ai/summarize
  if (method === 'POST' && path === '/api/ai/summarize') {
    const session = getSession(req)
    if (!session) { json(res, { error: 'unauthenticated' }, 401); return true }
    try {
      const body = await readBody(req) as any
      body.user_id = session.userId
      const forwardRes = await fetch('http://localhost:8000/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!forwardRes.ok) {
        const errText = await forwardRes.text()
        json(res, { error: `AI service error: ${errText}` }, forwardRes.status)
        return true
      }
      const data = await forwardRes.json()
      json(res, data)
    } catch (err) {
      json(res, { error: `Failed to communicate with AI agent: ${String(err)}` }, 500)
    }
    return true
  }

  // POST /api/ai/tags
  if (method === 'POST' && path === '/api/ai/tags') {
    const session = getSession(req)
    if (!session) { json(res, { error: 'unauthenticated' }, 401); return true }
    try {
      const body = await readBody(req) as any
      body.user_id = session.userId
      const forwardRes = await fetch('http://localhost:8000/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!forwardRes.ok) {
        const errText = await forwardRes.text()
        json(res, { error: `AI service error: ${errText}` }, forwardRes.status)
        return true
      }
      const data = await forwardRes.json()
      json(res, data)
    } catch (err) {
      json(res, { error: `Failed to communicate with AI agent: ${String(err)}` }, 500)
    }
    return true
  }

  return false
}
