import type { IncomingMessage, ServerResponse } from 'node:http'
import { createReadStream } from 'node:fs'
import { db, sqlite } from '../lib/db'
import { notes, attachments, users, teams } from '../../drizzle/schema'
import { desc, eq, and, sql } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { saveFile, getFilePath, deleteFile } from '../lib/storage'
import bcrypt from 'bcryptjs'

// Hono Imports
import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { stream, streamSSE } from 'hono/streaming'
import { createMiddleware } from 'hono/factory'
import { getRequestListener } from '@hono/node-server'

const AI_AGENT_URL = process.env.AI_AGENT_URL || 'http://localhost:8000'

type Env = {
  Variables: {
    session: { userId: string; username: string; role: string; teamId?: string }
  }
}

export const app = new Hono<Env>()

// SSE types and state for Real-Time Note Collaboration
type SSEClient = {
  id: string
  userId: string
  username: string
  write: (data: string, event: string) => Promise<void>
}

// Maps noteId -> Array of active SSEClient connections
export const noteSubscribers = new Map<string, SSEClient[]>()

// Maps noteId -> Map of userId -> { username: string, timestamp: number }
export const noteTypingState = new Map<string, Map<string, { username: string; timestamp: number }>>()

export function broadcastPresence(noteId: string) {
  const list = noteSubscribers.get(noteId) || []
  const activeUsers = list.map(cli => ({ userId: cli.userId, username: cli.username }))
  // Filter out duplicates
  const uniqueUsers = activeUsers.filter((val, index, self) =>
    self.findIndex(t => t.userId === val.userId) === index
  )

  for (const client of list) {
    client.write(JSON.stringify(uniqueUsers), 'presence').catch(() => {})
  }
}

export function broadcastTyping(noteId: string) {
  const map = noteTypingState.get(noteId)
  const list = noteSubscribers.get(noteId) || []
  
  const now = Date.now()
  const activeTyping: { username: string; pos: number; isTyping: boolean }[] = []
  
  if (map) {
    for (const [userId, val] of map.entries()) {
      const isSubscribed = list.some(cli => cli.userId === userId)
      if (isSubscribed) {
        activeTyping.push({
          username: val.username,
          pos: (val as any).pos ?? 0,
          isTyping: now - val.timestamp < 4000
        })
      } else {
        map.delete(userId)
      }
    }
  }

  for (const client of list) {
    const typingFiltered = activeTyping.filter(item => item.username !== client.username)
    client.write(JSON.stringify(typingFiltered), 'typing').catch(() => {})
  }
}

// Global interval to automatically update typing status after inactivity
setInterval(() => {
  for (const noteId of noteTypingState.keys()) {
    broadcastTyping(noteId)
  }
}, 2000)

app.use('*', async (c, next) => {
  console.log(`[Hono Request] ${c.req.method} ${c.req.url}`)
  await next()
})

app.onError((err, c) => {
  console.error('[Hono Error]', err)
  return c.json({ error: err.message }, 500)
})

// Helper to get session from Hono Context
function getSession(c: any) {
  const sessionToken = getCookie(c, 'session')
  if (!sessionToken) return null
  const row = sqlite.prepare('SELECT user_id as userId, username, role FROM sessions WHERE token = ?').get(sessionToken) as { userId: string; username: string; role: string } | undefined
  return row ?? null
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

// Hono Middlewares
const authMiddleware = createMiddleware<Env>(async (c, next) => {
  const session = getSession(c)
  if (!session) {
    return c.json({ error: 'unauthenticated' }, 401)
  }
  c.set('session', session)
  await next()
})

const adminMiddleware = createMiddleware<Env>(async (c, next) => {
  const session = getSession(c)
  if (!session) {
    return c.json({ error: 'unauthenticated' }, 401)
  }
  if (session.role !== 'admin') {
    return c.json({ error: 'forbidden' }, 403)
  }
  c.set('session', session)
  await next()
})

// --- AUTH ENDPOINTS ---

app.post('/api/auth/login', async (c) => {
  console.log('[Hono Login] Route reached!')
  const body = await c.req.json().catch((err) => {
    console.error('[Hono Login] Error parsing JSON body:', err)
    return {}
  }) as { username?: string; password?: string }
  console.log('[Hono Login] Parsed body:', body)
  const { username, password } = body
  if (!username || !password) {
    return c.json({ error: 'username and password required' }, 400)
  }
  const [user] = await db.select().from(users).where(eq(users.username, username))
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return c.json({ error: 'Invalid username or password' }, 401)
  }
  if (user.status === 'pending') {
    return c.json({ error: 'Akun Anda sedang menunggu persetujuan admin.' }, 403)
  }
  if (user.status === 'rejected') {
    return c.json({ error: 'Pendaftaran akun Anda ditolak oleh admin.' }, 403)
  }
  const token = randomUUID()
  sqlite.prepare('INSERT INTO sessions (token, user_id, username, role, created_at) VALUES (?, ?, ?, ?, ?)').run(token, user.id, user.username, user.role, Date.now())
  setCookie(c, 'session', token, { path: '/', httpOnly: true, sameSite: 'Strict' })
  return c.json({ userId: user.id, username: user.username, role: user.role, teamId: user.teamId })
})

app.post('/api/auth/logout', async (c) => {
  const token = getCookie(c, 'session')
  if (token) {
    sqlite.prepare('DELETE FROM sessions WHERE token = ?').run(token)
  }
  deleteCookie(c, 'session', { path: '/', httpOnly: true, sameSite: 'Strict' })
  return c.json({ ok: true })
})

app.get('/api/auth/me', async (c) => {
  const session = getSession(c)
  if (!session) {
    return c.json({ error: 'unauthenticated' }, 401)
  }
  const [me] = await db.select({ teamId: users.teamId }).from(users).where(eq(users.id, session.userId))
  return c.json({ ...session, teamId: me?.teamId ?? null })
})

app.post('/api/auth/register', adminMiddleware, async (c) => {
  const body = await c.req.json().catch(() => ({})) as { username?: string; password?: string; role?: string }
  const { username, password, role } = body
  if (!username || !password) {
    return c.json({ error: 'username and password required' }, 400)
  }
  const validRole = role === 'admin' ? 'admin' : 'viewer'
  const cleanUsername = username.trim()
  const existing = sqlite.prepare('SELECT id FROM users WHERE username = ?').get(cleanUsername)
  if (existing) {
    return c.json({ error: 'username already exists' }, 409)
  }
  const hash = bcrypt.hashSync(password, 10)
  const id = randomUUID()
  await db.insert(users).values({ id, username: cleanUsername, passwordHash: hash, role: validRole, status: 'approved', createdAt: Date.now() })
  return c.json({ id, username: cleanUsername, role: validRole }, 201)
})

app.post('/api/auth/public-register', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { username?: string; password?: string }
  const { username, password } = body
  if (!username || !password) {
    return c.json({ error: 'username and password required' }, 400)
  }
  const cleanUsername = username.trim()
  if (!cleanUsername) {
    return c.json({ error: 'username cannot be empty' }, 400)
  }
  const existing = sqlite.prepare('SELECT id FROM users WHERE username = ?').get(cleanUsername)
  if (existing) {
    return c.json({ error: 'Username sudah digunakan' }, 409)
  }
  const hash = bcrypt.hashSync(password, 10)
  const id = randomUUID()
  await db.insert(users).values({ id, username: cleanUsername, passwordHash: hash, role: 'viewer', status: 'pending', createdAt: Date.now() })
  return c.json({ id, username: cleanUsername, status: 'pending' }, 201)
})

app.post('/api/auth/change-password', authMiddleware, async (c) => {
  const session = c.get('session')
  const body = await c.req.json().catch(() => ({})) as { oldPassword?: string; newPassword?: string }
  const { oldPassword, newPassword } = body
  if (!oldPassword || !newPassword) {
    return c.json({ error: 'oldPassword and newPassword required' }, 400)
  }
  const [user] = await db.select().from(users).where(eq(users.id, session.userId))
  if (!user) {
    return c.json({ error: 'user not found' }, 404)
  }
  if (!bcrypt.compareSync(oldPassword, user.passwordHash)) {
    return c.json({ error: 'Password lama salah' }, 400)
  }
  const hash = bcrypt.hashSync(newPassword, 10)
  await db.update(users).set({ passwordHash: hash }).where(eq(users.id, session.userId))
  return c.json({ ok: true })
})

app.put('/api/auth/users/:id/reset-password', adminMiddleware, async (c) => {
  const userId = c.req.param('id')
  const body = await c.req.json().catch(() => ({})) as { newPassword?: string }
  const { newPassword } = body
  if (!newPassword) {
    return c.json({ error: 'newPassword required' }, 400)
  }
  const hash = bcrypt.hashSync(newPassword, 10)
  await db.update(users).set({ passwordHash: hash }).where(eq(users.id, userId))
  return c.json({ ok: true })
})

app.get('/api/auth/users', adminMiddleware, async (c) => {
  const all = await db.select({ 
    id: users.id, 
    username: users.username, 
    role: users.role, 
    teamId: users.teamId, 
    status: users.status, 
    createdAt: users.createdAt 
  }).from(users)
  return c.json(all)
})

app.put('/api/auth/users/:id/approve', adminMiddleware, async (c) => {
  const userId = c.req.param('id')
  await db.update(users).set({ status: 'approved' }).where(eq(users.id, userId))
  return c.json({ ok: true })
})

app.put('/api/auth/users/:id/reject', adminMiddleware, async (c) => {
  const userId = c.req.param('id')
  await db.update(users).set({ status: 'rejected' }).where(eq(users.id, userId))
  return c.json({ ok: true })
})

app.delete('/api/auth/users/:id', adminMiddleware, async (c) => {
  const session = c.get('session')
  const userId = c.req.param('id')
  if (userId === session.userId) {
    return c.json({ error: 'cannot delete yourself' }, 400)
  }
  await db.delete(users).where(eq(users.id, userId))
  return c.json({ ok: true })
})

// --- TEAM ENDPOINTS ---

app.get('/api/teams', authMiddleware, async (c) => {
  const all = await db.select().from(teams).orderBy(teams.name)
  return c.json(all)
})

app.post('/api/teams', adminMiddleware, async (c) => {
  const body = await c.req.json().catch(() => ({})) as { name?: string; description?: string }
  const { name, description } = body
  if (!name?.trim()) {
    return c.json({ error: 'name required' }, 400)
  }
  const id = randomUUID()
  await db.insert(teams).values({ id, name: name.trim(), description: description?.trim() ?? null, createdAt: Date.now() })
  return c.json({ id, name, description }, 201)
})

app.put('/api/teams/:id', adminMiddleware, async (c) => {
  const teamId = c.req.param('id')
  const body = await c.req.json().catch(() => ({})) as { name?: string; description?: string }
  const { name, description } = body
  if (!name?.trim()) {
    return c.json({ error: 'name required' }, 400)
  }
  await db.update(teams).set({ name: name.trim(), description: description?.trim() ?? null }).where(eq(teams.id, teamId))
  return c.json({ ok: true })
})

app.delete('/api/teams/:id', adminMiddleware, async (c) => {
  const teamId = c.req.param('id')
  await db.update(users).set({ teamId: null }).where(eq(users.teamId, teamId))
  await db.delete(teams).where(eq(teams.id, teamId))
  return c.json({ ok: true })
})

app.put('/api/teams/:id/members/:userId', adminMiddleware, async (c) => {
  const teamId = c.req.param('id')
  const userId = c.req.param('userId')
  await db.update(users).set({ teamId }).where(eq(users.id, userId))
  return c.json({ ok: true })
})

app.delete('/api/teams/:id/members/:userId', adminMiddleware, async (c) => {
  const userId = c.req.param('userId')
  await db.update(users).set({ teamId: null }).where(eq(users.id, userId))
  return c.json({ ok: true })
})

// --- SEARCH & NOTES ENDPOINTS ---

app.get('/api/search', authMiddleware, async (c) => {
  const session = c.get('session')
  const q = c.req.query('q')?.trim()
  if (!q) return c.json([])

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

  return c.json(rows)
})

app.get('/api/notes', authMiddleware, async (c) => {
  const session = c.get('session')
  const scope = c.req.query('scope')

  const [me] = await db.select({ teamId: users.teamId }).from(users).where(eq(users.id, session.userId))
  const myTeamId = me?.teamId ?? null

  let allNotes: any[] = []
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
      allNotes = await db.select().from(notes).where(and(eq(notes.userId, session.userId), eq(notes.type, 'individual'))).orderBy(desc(notes.createdAt))
    }
  }

  return c.json(allNotes.map(n => stripAndEnrich(n)))
})

app.get('/api/daily-log', authMiddleware, async (c) => {
  const session = c.get('session')
  const dateStr = c.req.query('date')
  if (!dateStr) return c.json({ error: 'date required' }, 400)
  const title = `[Daily] ${dateStr}`
  const [existing] = await db.select().from(notes).where(and(eq(notes.userId, session.userId), eq(notes.title, title)))
  if (existing) return c.json(stripAndEnrich(existing))
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
  return c.json(stripAndEnrich(note), 201)
})

app.post('/api/notes', authMiddleware, async (c) => {
  const session = c.get('session')
  const body = await c.req.json().catch(() => ({})) as { teamId?: string | null; type?: 'individual' | 'team' | null } | null
  const teamId = body?.teamId ?? null
  const type = body?.type || (teamId ? 'team' : 'individual')
  const now = Date.now()
  const id = randomUUID()
  const note = { id, userId: session.userId, teamId, type, title: '', content: '{"type":"doc","content":[]}', createdAt: now, updatedAt: now }
  await db.insert(notes).values(note)
  return c.json(stripAndEnrich(note), 201)
})

// --- PUBLIC SHARE ROUTE ---

app.get('/api/share/:token', async (c) => {
  const token = c.req.param('token')
  const row = sqlite.prepare('SELECT id, title, content, user_id as userId, updated_by_user_id as updatedByUserId, created_at as createdAt, updated_at as updatedAt, share_pin_hash as sharePinHash, cover_image as coverImage, icon FROM notes WHERE share_token = ?').get(token) as { id: string; title: string; content: string; userId: string; updatedByUserId: string | null; createdAt: number; updatedAt: number; sharePinHash: string | null; coverImage: string | null; icon: string | null } | undefined
  if (!row) return c.json({ error: 'not found' }, 404)
  const { sharePinHash, ...rest } = row
  return c.json({
    ...rest,
    hasPinProtection: !!sharePinHash,
    createdByUsername: getUsernameById(rest.userId),
    updatedByUsername: getUsernameById(rest.updatedByUserId),
  })
})

app.post('/api/share/:token/verify', async (c) => {
  const token = c.req.param('token')
  const row = sqlite.prepare('SELECT share_pin_hash as sharePinHash FROM notes WHERE share_token = ?').get(token) as { sharePinHash: string | null } | undefined
  if (!row) return c.json({ error: 'not found' }, 404)
  if (!row.sharePinHash) return c.json({ ok: true })
  const body = await c.req.json().catch(() => ({})) as { pin?: string }
  if (!body.pin || !bcrypt.compareSync(body.pin, row.sharePinHash)) {
    return c.json({ error: 'invalid pin' }, 401)
  }
  return c.json({ ok: true })
})

// --- SECURE NOTE ACTIONS ---

app.post('/api/notes/:id/share', authMiddleware, async (c) => {
  const id = c.req.param('id')
  const session = c.get('session')
  const ownerFilter = await getOwnerFilter(id, session.userId, session.role)
  const body = await c.req.json().catch(() => ({})) as { pin?: string }
  const token = randomUUID()
  const sharePinHash = body.pin ? bcrypt.hashSync(body.pin, 10) : null
  await db.update(notes).set({ shareToken: token, sharePinHash }).where(ownerFilter)
  return c.json({ token, hasPinProtection: !!sharePinHash })
})

app.delete('/api/notes/:id/share', authMiddleware, async (c) => {
  const id = c.req.param('id')
  const session = c.get('session')
  const ownerFilter = await getOwnerFilter(id, session.userId, session.role)
  await db.update(notes).set({ shareToken: null, sharePinHash: null }).where(ownerFilter)
  return c.json({ ok: true })
})

app.patch('/api/notes/:id/share', authMiddleware, async (c) => {
  const id = c.req.param('id')
  const session = c.get('session')
  const ownerFilter = await getOwnerFilter(id, session.userId, session.role)
  const body = await c.req.json().catch(() => ({})) as { pin?: string | null }
  const sharePinHash = body.pin ? bcrypt.hashSync(body.pin, 10) : null
  await db.update(notes).set({ sharePinHash }).where(ownerFilter)
  return c.json({ ok: true, hasPinProtection: !!sharePinHash })
})

app.put('/api/notes/:id/pin', authMiddleware, async (c) => {
  const id = c.req.param('id')
  const session = c.get('session')
  const ownerFilter = await getOwnerFilter(id, session.userId, session.role)
  const body = await c.req.json().catch(() => ({})) as { pin?: string }
  if (!body.pin || !/^\d{4}$/.test(body.pin)) {
    return c.json({ error: 'pin must be 4 digits' }, 400)
  }
  const hash = bcrypt.hashSync(body.pin, 10)
  await db.update(notes).set({ pinHash: hash }).where(ownerFilter)
  return c.json({ ok: true })
})

app.delete('/api/notes/:id/pin', authMiddleware, async (c) => {
  const id = c.req.param('id')
  const session = c.get('session')
  const ownerFilter = await getOwnerFilter(id, session.userId, session.role)
  const body = await c.req.json().catch(() => ({})) as { pin?: string }
  const [note] = await db.select().from(notes).where(ownerFilter)
  if (!note) return c.json({ error: 'not found' }, 404)
  if (!note.pinHash || !body.pin || !bcrypt.compareSync(body.pin, note.pinHash)) {
    return c.json({ error: 'invalid pin' }, 401)
  }
  await db.update(notes).set({ pinHash: null }).where(ownerFilter)
  return c.json({ ok: true })
})

app.post('/api/notes/:id/pin/verify', authMiddleware, async (c) => {
  const id = c.req.param('id')
  const session = c.get('session')
  const ownerFilter = await getOwnerFilter(id, session.userId, session.role)
  const body = await c.req.json().catch(() => ({})) as { pin?: string }
  const [note] = await db.select().from(notes).where(ownerFilter)
  if (!note) return c.json({ error: 'not found' }, 404)
  if (!note.pinHash || !body.pin || !bcrypt.compareSync(body.pin, note.pinHash)) {
    return c.json({ error: 'invalid pin' }, 401)
  }
  return c.json({ ok: true })
})

app.post('/api/notes/:id/copy-to-team', authMiddleware, async (c) => {
  const id = c.req.param('id')
  const session = c.get('session')
  
  const [sessionUser] = await db.select({ teamId: users.teamId }).from(users).where(eq(users.id, session.userId))
  const userTeamId = sessionUser?.teamId ?? null
  if (!userTeamId) return c.json({ error: 'Anda belum tergabung dalam tim' }, 400)

  const ownerFilter = await getOwnerFilter(id, session.userId, session.role)
  const [note] = await db.select().from(notes).where(ownerFilter)
  if (!note) return c.json({ error: 'Catatan tidak ditemukan atau Anda tidak memiliki akses' }, 404)

  const [existingChild] = await db.select().from(notes).where(
    and(
      eq(notes.copiedFromId, id),
      eq(notes.teamId, userTeamId),
      eq(notes.type, 'team')
    )
  )

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
    return c.json({ error: 'Catatan ini sudah ada di ruang kerja Tim (sudah pernah disalin dan masih ada di target)' }, 400)
  }

  const body = await c.req.json().catch(() => ({})) as { pin?: string | null }
  const pin = body?.pin
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

  return c.json({ ok: true, id: newId }, 201)
})

app.post('/api/notes/:id/move-to-team', authMiddleware, async (c) => {
  const id = c.req.param('id')
  const session = c.get('session')

  const [sessionUser] = await db.select({ teamId: users.teamId }).from(users).where(eq(users.id, session.userId))
  const userTeamId = sessionUser?.teamId ?? null
  if (!userTeamId) return c.json({ error: 'Anda belum tergabung dalam tim' }, 400)

  const ownerFilter = await getOwnerFilter(id, session.userId, session.role)
  const [note] = await db.select().from(notes).where(ownerFilter)
  if (!note) return c.json({ error: 'Catatan tidak ditemukan atau Anda tidak memiliki akses' }, 404)

  const body = await c.req.json().catch(() => ({})) as { pin?: string | null }
  const pin = body?.pin
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

  return c.json({ ok: true })
})

app.post('/api/notes/:id/copy-to-personal', authMiddleware, async (c) => {
  const id = c.req.param('id')
  const session = c.get('session')

  const ownerFilter = await getOwnerFilter(id, session.userId, session.role)
  const [note] = await db.select().from(notes).where(ownerFilter)
  if (!note) return c.json({ error: 'Catatan tidak ditemukan atau Anda tidak memiliki akses' }, 404)

  const [existingChild] = await db.select().from(notes).where(
    and(
      eq(notes.copiedFromId, id),
      eq(notes.userId, session.userId),
      eq(notes.type, 'individual')
    )
  )

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
    return c.json({ error: 'Catatan ini sudah ada di ruang kerja Saya (sudah pernah disalin dan masih ada di target)' }, 400)
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

  return c.json({ ok: true, id: newId }, 201)
})

app.post('/api/notes/:id/move-to-personal', authMiddleware, async (c) => {
  const id = c.req.param('id')
  const session = c.get('session')

  const ownerFilter = await getOwnerFilter(id, session.userId, session.role)
  const [note] = await db.select().from(notes).where(ownerFilter)
  if (!note) return c.json({ error: 'Catatan tidak ditemukan atau Anda tidak memiliki akses' }, 404)

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

  return c.json({ ok: true })
})

app.get('/api/metadata', authMiddleware, async (c) => {
  const urlStr = c.req.query('url')
  if (!urlStr) return c.json({ error: 'url parameter required' }, 400)

  try {
    const url = new URL(urlStr)
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NoteAppBot/1.0)' },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`)
    const html = await res.text()

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)
    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)
    const ogDescMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i)
    const ogImageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
    
    let faviconUrl = `${url.protocol}//${url.host}/favicon.ico`
    const faviconMatch = html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i)
    if (faviconMatch && faviconMatch[1]) {
      if (faviconMatch[1].startsWith('http')) {
        faviconUrl = faviconMatch[1]
      } else if (faviconMatch[1].startsWith('/')) {
        faviconUrl = `${url.protocol}//${url.host}${faviconMatch[1]}`
      } else {
        faviconUrl = `${url.protocol}//${url.host}/${faviconMatch[1]}`
      }
    }

    const title = ogTitleMatch ? ogTitleMatch[1] : (titleMatch ? titleMatch[1] : url.host)
    const description = ogDescMatch ? ogDescMatch[1] : (descMatch ? descMatch[1] : '')
    const image = ogImageMatch ? ogImageMatch[1] : ''

    return c.json({
      title: title.trim(),
      description: description.trim(),
      image: image,
      icon: faviconUrl,
      url: url.toString()
    })
  } catch (err) {
    console.error('Metadata scrape error for url:', urlStr, err)
    return c.json({
      title: new URL(urlStr).host,
      description: '',
      image: '',
      icon: `${new URL(urlStr).protocol}//${new URL(urlStr).host}/favicon.ico`,
      url: urlStr
    })
  }
})

app.get('/api/notes/:id', authMiddleware, async (c) => {
  const id = c.req.param('id')
  const session = c.get('session')
  const ownerFilter = await getOwnerFilter(id, session.userId, session.role)
  const [note] = await db.select().from(notes).where(ownerFilter)
  if (!note) return c.json({ error: 'not found' }, 404)
  return c.json(stripAndEnrich(note))
})

app.get('/api/notes/:id/events', authMiddleware, async (c) => {
  const noteId = c.req.param('id')
  const session = c.get('session')
  const clientUuid = randomUUID()

  // Verify the user has access to this note
  const ownerFilter = await getOwnerFilter(noteId, session.userId, session.role)
  const [note] = await db.select().from(notes).where(ownerFilter)
  if (!note) {
    return c.json({ error: 'not found' }, 404)
  }

  return streamSSE(c, async (stream) => {
    const write = async (data: string, event: string) => {
      await stream.writeSSE({
        data,
        event,
        id: randomUUID()
      })
    }

    const client: SSEClient = {
      id: clientUuid,
      userId: session.userId,
      username: session.username,
      write
    }

    // Add to subscribers
    const list = noteSubscribers.get(noteId) || []
    list.push(client)
    noteSubscribers.set(noteId, list)

    console.log(`[SSE] User ${session.username} joined note ${noteId}`)

    // Broadcast presence update immediately
    broadcastPresence(noteId)

    // Keep connection alive and clean up on abort
    stream.onAbort(() => {
      const activeList = noteSubscribers.get(noteId) || []
      const filtered = activeList.filter(cli => cli.id !== clientUuid)
      if (filtered.length > 0) {
        noteSubscribers.set(noteId, filtered)
      } else {
        noteSubscribers.delete(noteId)
      }

      // If no more connections for this userId, clean up their typing status
      const hasOtherConnections = filtered.some(cli => cli.userId === session.userId)
      if (!hasOtherConnections) {
        const typingMap = noteTypingState.get(noteId)
        if (typingMap) {
          typingMap.delete(session.userId)
        }
      }

      console.log(`[SSE] User ${session.username} left note ${noteId}`)
      // Broadcast updates
      broadcastPresence(noteId)
      broadcastTyping(noteId)
    })

    // Sleep in a loop to keep stream open (Hono requires this to not close the request handler)
    while (true) {
      await stream.sleep(30000) // 30s heartbeat
      try {
        await write('ping', 'heartbeat')
      } catch (e) {
        break // connection closed
      }
    }
  })
})

app.put('/api/notes/:id', authMiddleware, async (c) => {
  const id = c.req.param('id')
  const session = c.get('session')
  const ownerFilter = await getOwnerFilter(id, session.userId, session.role)
  const body = await c.req.json().catch(() => ({})) as { title?: string; content?: string; coverImage?: string | null; icon?: string | null }
  const { title, content, coverImage, icon } = body
  await db.update(notes)
    .set({
      ...(title !== undefined && { title }),
      ...(content !== undefined && { content }),
      ...(coverImage !== undefined && { coverImage }),
      ...(icon !== undefined && { icon }),
      updatedByUserId: session.userId,
      updatedAt: Date.now()
    })
    .where(ownerFilter)
  const [updated] = await db.select().from(notes).where(ownerFilter)
  if (!updated) return c.json({ error: 'not found' }, 404)

  // Broadcast update to other active subscribers of this note
  const list = noteSubscribers.get(id) || []
  for (const client of list) {
    if (client.userId !== session.userId) {
      client.write(JSON.stringify({
        updatedBy: session.username,
        updatedByUserId: session.userId,
        title: updated.title,
        content: updated.content,
        coverImage: updated.coverImage,
        icon: updated.icon,
        updatedAt: updated.updatedAt
      }), 'note-updated').catch(() => {})
    }
  }

  return c.json(stripAndEnrich(updated))
})

app.post('/api/notes/:id/typing', authMiddleware, async (c) => {
  const noteId = c.req.param('id')
  const session = c.get('session')
  const body = await c.req.json().catch(() => ({})) as { pos?: number }

  let map = noteTypingState.get(noteId)
  if (!map) {
    map = new Map()
    noteTypingState.set(noteId, map)
  }

  map.set(session.userId, {
    username: session.username,
    timestamp: Date.now(),
    pos: body.pos ?? 0
  })

  broadcastTyping(noteId)
  return c.json({ ok: true })
})

app.delete('/api/notes/:id', authMiddleware, async (c) => {
  const id = c.req.param('id')
  const session = c.get('session')
  const ownerFilter = await getOwnerFilter(id, session.userId, session.role)
  await db.delete(notes).where(ownerFilter)
  return c.json({ ok: true })
})

// --- ATTACHMENT ACTIONS ---

app.post('/api/attachments', authMiddleware, async (c) => {
  const body = await c.req.parseBody()
  const file = body.file as File
  const noteId = body.noteId as string

  if (!file || !noteId) {
    return c.json({ error: 'missing file or noteId' }, 400)
  }

  const arrayBuffer = await file.arrayBuffer()
  const fileBuffer = Buffer.from(arrayBuffer)
  const filename = file.name
  const mimetype = file.type || 'application/octet-stream'

  const record = {
    id: randomUUID(),
    noteId,
    filename,
    storedAs: saveFile(fileBuffer, filename),
    mimeType: mimetype,
    size: fileBuffer.length,
    createdAt: Date.now(),
  }
  await db.insert(attachments).values(record)
  return c.json(record, 201)
})

app.get('/api/attachments/:id/inline', authMiddleware, async (c) => {
  const id = c.req.param('id')
  const [att] = await db.select().from(attachments).where(eq(attachments.id, id))
  if (!att) return c.json({ error: 'not found' }, 404)
  const filePath = getFilePath(att.storedAs)
  
  c.header('Content-Type', att.mimeType)
  c.header('Content-Length', String(att.size))
  
  return stream(c, async (s) => {
    const fileStream = createReadStream(filePath)
    for await (const chunk of fileStream) {
      await s.write(chunk)
    }
  })
})

app.get('/api/attachments/:id', authMiddleware, async (c) => {
  const id = c.req.param('id')
  const [att] = await db.select().from(attachments).where(eq(attachments.id, id))
  if (!att) return c.json({ error: 'not found' }, 404)
  const filePath = getFilePath(att.storedAs)
  
  c.header('Content-Type', att.mimeType)
  c.header('Content-Disposition', `attachment; filename="${att.filename.replace(/"/g, '\\"')}"`)
  c.header('Content-Length', String(att.size))
  
  return stream(c, async (s) => {
    const fileStream = createReadStream(filePath)
    for await (const chunk of fileStream) {
      await s.write(chunk)
    }
  })
})

app.delete('/api/attachments/:id', authMiddleware, async (c) => {
  const id = c.req.param('id')
  const [att] = await db.select().from(attachments).where(eq(attachments.id, id))
  if (!att) return c.json({ error: 'not found' }, 404)
  deleteFile(att.storedAs)
  await db.delete(attachments).where(eq(attachments.id, id))
  return c.json({ ok: true })
})

// --- AI AGENT PROXY ENDPOINTS ---

app.get('/api/ai/chat/history/:id', authMiddleware, async (c) => {
  const sessionId = c.req.param('id')
  try {
    const forwardRes = await fetch(`${AI_AGENT_URL}/api/chat/history/${sessionId}`)
    if (!forwardRes.ok) {
      const errText = await forwardRes.text()
      return c.json({ error: `AI service error: ${errText}` }, forwardRes.status as any)
    }
    const data = await forwardRes.json()
    return c.json(data)
  } catch (err) {
    return c.json({ error: `Failed to communicate with AI agent: ${String(err)}` }, 500)
  }
})

app.post('/api/ai/chat/stream', authMiddleware, async (c) => {
  const session = c.get('session')
  try {
    const body = await c.req.json() as any
    body.user_id = session.userId

    const forwardRes = await fetch(`${AI_AGENT_URL}/api/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    if (!forwardRes.ok) {
      const errText = await forwardRes.text()
      return c.json({ error: `AI service error: ${errText}` }, forwardRes.status as any)
    }

    c.header('Content-Type', 'text/event-stream')
    c.header('Cache-Control', 'no-cache')
    c.header('Connection', 'keep-alive')
    c.header('x-vercel-ai-ui-stream-event', 'v1')
    c.header('x-accel-buffering', 'no')
    c.header('X-Accel-Buffering', 'no')

    return stream(c, async (s) => {
      const reader = forwardRes.body?.getReader()
      if (!reader) return
      
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          await s.write(value)
        }
      } finally {
        reader.releaseLock()
      }
    })
  } catch (err) {
    console.error('[stream error]', err)
    return c.json({ error: `Failed to communicate with AI agent: ${String(err)}` }, 500)
  }
})

app.post('/api/ai/chat', authMiddleware, async (c) => {
  const session = c.get('session')
  try {
    const body = await c.req.json() as any
    body.user_id = session.userId
    const forwardRes = await fetch(`${AI_AGENT_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!forwardRes.ok) {
      const errText = await forwardRes.text()
      return c.json({ error: `AI service error: ${errText}` }, forwardRes.status as any)
    }
    const data = await forwardRes.json()
    return c.json(data)
  } catch (err) {
    return c.json({ error: `Failed to communicate with AI agent: ${String(err)}` }, 500)
  }
})

app.post('/api/ai/chat/approve_or_reject', authMiddleware, async (c) => {
  try {
    const body = await c.req.json() as any
    const forwardRes = await fetch(`${AI_AGENT_URL}/api/chat/approve_or_reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!forwardRes.ok) {
      const errText = await forwardRes.text()
      return c.json({ error: `AI service error: ${errText}` }, forwardRes.status as any)
    }
    const data = await forwardRes.json()
    return c.json(data)
  } catch (err) {
    return c.json({ error: `Failed to communicate with AI agent: ${String(err)}` }, 500)
  }
})

app.post('/api/ai/summarize', authMiddleware, async (c) => {
  const session = c.get('session')
  try {
    const body = await c.req.json() as any
    body.user_id = session.userId
    const forwardRes = await fetch(`${AI_AGENT_URL}/api/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!forwardRes.ok) {
      const errText = await forwardRes.text()
      return c.json({ error: `AI service error: ${errText}` }, forwardRes.status as any)
    }
    const data = await forwardRes.json()
    return c.json(data)
  } catch (err) {
    return c.json({ error: `Failed to communicate with AI agent: ${String(err)}` }, 500)
  }
})

app.post('/api/ai/tags', authMiddleware, async (c) => {
  const session = c.get('session')
  try {
    const body = await c.req.json() as any
    body.user_id = session.userId
    const forwardRes = await fetch(`${AI_AGENT_URL}/api/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!forwardRes.ok) {
      const errText = await forwardRes.text()
      return c.json({ error: `AI service error: ${errText}` }, forwardRes.status as any)
    }
    const data = await forwardRes.json()
    return c.json(data)
  } catch (err) {
    return c.json({ error: `Failed to communicate with AI agent: ${String(err)}` }, 500)
  }
})

// Hono handler wrapper for backward compatibility with Vite middleware and server.ts
const nodeHandler = getRequestListener(app.fetch)

export async function handleApiRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url!, `http://${req.headers.host || 'localhost'}`)
  if (!url.pathname.startsWith('/api/')) {
    return false
  }

  await new Promise<void>((resolve, reject) => {
    res.on('finish', resolve)
    res.on('close', resolve)
    res.on('error', reject)
    nodeHandler(req, res)
  })
  return true
}
