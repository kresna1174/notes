import type { IncomingMessage, ServerResponse } from 'node:http'
import { createReadStream, existsSync } from 'node:fs'
import { db } from '../shared/db'
import { notes, attachments, users, organizations, userOrganizations, noteHistory } from '../../../drizzle/schema'
import { desc, eq, and, sql, or, inArray } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { saveFile, getFilePath, deleteFile } from '../shared/storage'
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
    session: { userId: string; username: string; role: string }
  }
}

export const app = new Hono<Env>()



app.use('*', async (c, next) => {
  console.log(`[Hono Request] ${c.req.method} ${c.req.url}`)
  await next()
})

app.onError((err, c) => {
  console.error('[Hono Error]', err)
  return c.json({ error: err.message }, 500)
})

// Helper to get session from Hono Context
async function getSession(c: any) {
  const sessionToken = getCookie(c, 'session')
  if (!sessionToken) return null
  const result = await db.execute(sql`SELECT user_id as "userId", username, role FROM sessions WHERE token = ${sessionToken}`)
  return (result.rows[0] as { userId: string; username: string; role: string } | undefined) ?? null
}

async function getUsernameById(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null
  const result = await db.execute(sql`SELECT username FROM users WHERE id = ${userId}`)
  return (result.rows[0] as { username: string } | undefined)?.username ?? null
}

async function stripAndEnrich(note: Record<string, any>) {
  const { pinHash, sharePinHash, ...rest } = note
  return {
    ...rest,
    isLocked: !!pinHash,
    hasPinProtection: !!sharePinHash,
    createdByUsername: await getUsernameById(rest.userId),
    updatedByUsername: await getUsernameById(rest.updatedByUserId),
  }
}

async function getUserOrganizations(userId: string) {
  const orgs = await db.select({
    id: organizations.id,
    name: organizations.name,
    description: organizations.description,
  })
  .from(userOrganizations)
  .innerJoin(organizations, eq(userOrganizations.organizationId, organizations.id))
  .where(eq(userOrganizations.userId, userId))
  return orgs
}

async function getOwnerFilter(id: string, userId: string, role: string) {
  if (role === 'admin') {
    return eq(notes.id, id)
  }
  const myOrgs = await db.select({ orgId: userOrganizations.organizationId })
    .from(userOrganizations)
    .where(eq(userOrganizations.userId, userId))
  const myOrgIds = myOrgs.map(o => o.orgId)
  if (myOrgIds.length > 0) {
    return and(
      eq(notes.id, id),
      or(
        eq(notes.userId, userId),
        and(eq(notes.type, 'organization'), inArray(notes.organizationId, myOrgIds))
      )
    )
  }
  return and(eq(notes.id, id), eq(notes.userId, userId))
}

// Hono Middlewares
const authMiddleware = createMiddleware<Env>(async (c, next) => {
  const session = await getSession(c)
  if (!session) {
    return c.json({ error: 'unauthenticated' }, 401)
  }
  c.set('session', session)
  await next()
})

const adminMiddleware = createMiddleware<Env>(async (c, next) => {
  const session = await getSession(c)
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
  await db.execute(sql`INSERT INTO sessions (token, user_id, username, role, created_at) VALUES (${token}, ${user.id}, ${user.username}, ${user.role}, ${Date.now()})`)
  setCookie(c, 'session', token, { path: '/', httpOnly: true, sameSite: 'Strict' })
  const orgs = await getUserOrganizations(user.id)
  return c.json({ userId: user.id, username: user.username, role: user.role, organizations: orgs })
})

app.post('/api/auth/logout', async (c) => {
  const token = getCookie(c, 'session')
  if (token) {
    await db.execute(sql`DELETE FROM sessions WHERE token = ${token}`)
  }
  deleteCookie(c, 'session', { path: '/', httpOnly: true, sameSite: 'Strict' })
  return c.json({ ok: true })
})

app.get('/api/auth/me', async (c) => {
  const session = await getSession(c)
  if (!session) {
    return c.json({ error: 'unauthenticated' }, 401)
  }
  const orgs = await getUserOrganizations(session.userId)
  return c.json({ ...session, organizations: orgs })
})

app.post('/api/auth/register', adminMiddleware, async (c) => {
  const body = await c.req.json().catch(() => ({})) as { username?: string; password?: string; role?: string }
  const { username, password, role } = body
  if (!username || !password) {
    return c.json({ error: 'username and password required' }, 400)
  }
  const validRole = role === 'admin' ? 'admin' : 'viewer'
  const cleanUsername = username.trim()
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.username, cleanUsername)).limit(1)
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
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.username, cleanUsername)).limit(1)
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
  const session = c.get('session')
  if (userId === session.userId) {
    return c.json({ error: 'Cannot change your own password here' }, 400)
  }
  const body = await c.req.json().catch(() => ({})) as { newPassword?: string }
  const { newPassword } = body
  if (!newPassword) {
    return c.json({ error: 'newPassword required' }, 400)
  }
  const hash = bcrypt.hashSync(newPassword, 10)
  await db.update(users).set({ passwordHash: hash }).where(eq(users.id, userId))
  return c.json({ ok: true })
})

app.put('/api/auth/users/:id', adminMiddleware, async (c) => {
  const userId = c.req.param('id')
  const session = c.get('session')
  const body = await c.req.json().catch(() => ({})) as { username?: string; role?: string }
  const updates: Record<string, unknown> = {}
  if (body.username) {
    if (userId === session.userId) {
      return c.json({ error: 'Cannot change your own username' }, 400)
    }
    const duplicate = await db.select().from(users).where(eq(users.username, body.username)).limit(1)
    if (duplicate.length > 0 && duplicate[0].id !== userId) {
      return c.json({ error: 'Username already taken' }, 400)
    }
    updates.username = body.username
  }
  if (body.role && (body.role === 'admin' || body.role === 'viewer')) {
    updates.role = body.role
  }
  if (Object.keys(updates).length === 0) {
    return c.json({ error: 'No valid fields to update' }, 400)
  }
  await db.update(users).set(updates).where(eq(users.id, userId))
  return c.json({ ok: true })
})

app.get('/api/auth/users', adminMiddleware, async (c) => {
  const all = await db.select({ 
    id: users.id, 
    username: users.username, 
    role: users.role, 
    status: users.status, 
    createdAt: users.createdAt 
  }).from(users)

  const enrichedUsers = await Promise.all(
    all.map(async (u) => {
      const orgs = await getUserOrganizations(u.id)
      return {
        ...u,
        organizations: orgs,
        organizationIds: orgs.map(o => o.id),
      }
    })
  )
  return c.json(enrichedUsers)
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

// --- ORGANIZATION ENDPOINTS ---

app.get('/api/organizations', authMiddleware, async (c) => {
  const all = await db.select().from(organizations).orderBy(organizations.name)
  return c.json(all)
})

app.post('/api/organizations', adminMiddleware, async (c) => {
  const body = await c.req.json().catch(() => ({})) as { name?: string; description?: string }
  const { name, description } = body
  if (!name?.trim()) {
    return c.json({ error: 'name required' }, 400)
  }
  const id = randomUUID()
  await db.insert(organizations).values({ id, name: name.trim(), description: description?.trim() ?? null, createdAt: Date.now() })
  return c.json({ id, name, description }, 201)
})

app.put('/api/organizations/:id', adminMiddleware, async (c) => {
  const orgId = c.req.param('id')
  const body = await c.req.json().catch(() => ({})) as { name?: string; description?: string }
  const { name, description } = body
  if (!name?.trim()) {
    return c.json({ error: 'name required' }, 400)
  }
  await db.update(organizations).set({ name: name.trim(), description: description?.trim() ?? null }).where(eq(organizations.id, orgId))
  return c.json({ ok: true })
})

app.delete('/api/organizations/:id', adminMiddleware, async (c) => {
  const orgId = c.req.param('id')
  await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, orgId))
  await db.update(notes).set({ organizationId: null, type: 'individual' }).where(eq(notes.organizationId, orgId))
  await db.delete(organizations).where(eq(organizations.id, orgId))
  return c.json({ ok: true })
})

app.put('/api/organizations/:id/members/:userId', adminMiddleware, async (c) => {
  const orgId = c.req.param('id')
  const userId = c.req.param('userId')
  const [exists] = await db.select().from(userOrganizations).where(and(eq(userOrganizations.organizationId, orgId), eq(userOrganizations.userId, userId)))
  if (!exists) {
    await db.insert(userOrganizations).values({ userId, organizationId: orgId })
  }
  return c.json({ ok: true })
})

app.delete('/api/organizations/:id/members/:userId', adminMiddleware, async (c) => {
  const orgId = c.req.param('id')
  const userId = c.req.param('userId')
  await db.delete(userOrganizations).where(and(eq(userOrganizations.organizationId, orgId), eq(userOrganizations.userId, userId)))
  return c.json({ ok: true })
})

// --- SEARCH & NOTES ENDPOINTS ---

app.get('/api/search', authMiddleware, async (c) => {
  const session = c.get('session')
  const q = c.req.query('q')?.trim()
  if (!q) return c.json([])

  const pattern = `%${q}%`
  const result = session.role === 'admin'
    ? await db.execute(sql`
        SELECT id, title, created_at as "createdAt",
          SUBSTRING(content, 1, 200) as snippet
        FROM notes
        WHERE title ILIKE ${pattern} OR content ILIKE ${pattern}
        ORDER BY updated_at DESC LIMIT 50
      `)
    : await db.execute(sql`
        SELECT id, title, created_at as "createdAt",
          SUBSTRING(content, 1, 200) as snippet
        FROM notes
        WHERE (title ILIKE ${pattern} OR content ILIKE ${pattern})
          AND user_id = ${session.userId}
        ORDER BY updated_at DESC LIMIT 50
      `)

  return c.json(result.rows)
})

app.get('/api/notes', authMiddleware, async (c) => {
  const session = c.get('session')
  const scope = c.req.query('scope')
  const orgId = c.req.query('organizationId')

  const myOrgs = await db.select({ orgId: userOrganizations.organizationId }).from(userOrganizations).where(eq(userOrganizations.userId, session.userId))
  const myOrgIds = myOrgs.map(o => o.orgId)

  let allNotes: any[] = []
  if (session.role === 'admin') {
    if (scope === 'mine') {
      allNotes = await db.select().from(notes).where(eq(notes.type, 'individual')).orderBy(desc(notes.createdAt))
    } else if (scope === 'organization' && orgId) {
      allNotes = await db.select().from(notes).where(and(eq(notes.type, 'organization'), eq(notes.organizationId, orgId))).orderBy(desc(notes.createdAt))
    } else if (scope === 'organization') {
      allNotes = await db.select().from(notes).where(eq(notes.type, 'organization')).orderBy(desc(notes.createdAt))
    } else {
      allNotes = await db.select().from(notes).orderBy(desc(notes.createdAt))
    }
  } else {
    if (scope === 'mine') {
      allNotes = await db.select().from(notes).where(and(eq(notes.userId, session.userId), eq(notes.type, 'individual'))).orderBy(desc(notes.createdAt))
    } else if (scope === 'organization' && orgId && myOrgIds.includes(orgId)) {
      allNotes = await db.select().from(notes).where(and(eq(notes.organizationId, orgId), eq(notes.type, 'organization'))).orderBy(desc(notes.createdAt))
    } else if (scope === 'organization') {
      if (myOrgIds.length > 0) {
        allNotes = await db.select().from(notes).where(and(inArray(notes.organizationId, myOrgIds), eq(notes.type, 'organization'))).orderBy(desc(notes.createdAt))
      } else {
        allNotes = []
      }
    } else {
      allNotes = await db.select().from(notes).where(and(eq(notes.userId, session.userId), eq(notes.type, 'individual'))).orderBy(desc(notes.createdAt))
    }
  }

  return c.json(await Promise.all(allNotes.map(n => stripAndEnrich(n))))
})

app.post('/api/notes', authMiddleware, async (c) => {
  const session = c.get('session')
  const body = await c.req.json().catch(() => ({})) as { organizationId?: string | null; type?: 'individual' | 'organization' | null } | null
  const organizationId = body?.organizationId ?? null
  const type = body?.type || (organizationId ? 'organization' : 'individual')
  const now = Date.now()
  const id = randomUUID()
  const note = { id, userId: session.userId, organizationId, type, title: '', content: '{"type":"doc","content":[]}', createdAt: now, updatedAt: now }
  await db.insert(notes).values(note)
  return c.json(await stripAndEnrich(note), 201)
})

// --- PUBLIC SHARE ROUTE ---

app.get('/api/share/:token', async (c) => {
  const token = c.req.param('token')
  const [row] = await db.select().from(notes).where(eq(notes.shareToken, token))
  if (!row) return c.json({ error: 'not found' }, 404)
  const { pinHash, sharePinHash, ...rest } = row
  return c.json({
    ...rest,
    isLocked: !!pinHash,
    hasPinProtection: !!sharePinHash,
    createdByUsername: await getUsernameById(rest.userId),
    updatedByUsername: await getUsernameById(rest.updatedByUserId),
  })
})

app.post('/api/share/:token/verify', async (c) => {
  const token = c.req.param('token')
  const [row] = await db.select({ sharePinHash: notes.sharePinHash }).from(notes).where(eq(notes.shareToken, token))
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

// ── Admin-only: list all PIN-locked notes ─────────────────────────────────
app.get('/api/admin/locked-notes', authMiddleware, async (c) => {
  const session = c.get('session')
  if (session.role !== 'admin') return c.json({ error: 'forbidden' }, 403)

  const result = await db.execute(sql`
    SELECT n.id, n.title, n.created_at as "createdAt", n.updated_at as "updatedAt",
           u.username as "ownerUsername", u.id as "ownerId",
           n.type, n.organization_id as "organizationId"
    FROM notes n
    LEFT JOIN users u ON n.user_id = u.id
    WHERE n.pin_hash IS NOT NULL AND n.pin_hash != ''
    ORDER BY n.updated_at DESC
  `)

  return c.json(result.rows)
})

// ── Admin-only: force-reset (remove) PIN of any note ─────────────────────
app.delete('/api/admin/notes/:id/pin', authMiddleware, async (c) => {
  const session = c.get('session')
  if (session.role !== 'admin') return c.json({ error: 'forbidden' }, 403)

  const id = c.req.param('id')
  const [note] = await db.select().from(notes).where(eq(notes.id, id))
  if (!note) return c.json({ error: 'not found' }, 404)
  if (!note.pinHash) return c.json({ error: 'note is not PIN-locked' }, 400)

  await db.update(notes).set({ pinHash: null }).where(eq(notes.id, id))
  return c.json({ ok: true })
})

// ── Admin-only: force-set a new PIN on any note ───────────────────────────
app.put('/api/admin/notes/:id/pin', authMiddleware, async (c) => {
  const session = c.get('session')
  if (session.role !== 'admin') return c.json({ error: 'forbidden' }, 403)

  const id = c.req.param('id')
  const [note] = await db.select().from(notes).where(eq(notes.id, id))
  if (!note) return c.json({ error: 'not found' }, 404)

  const body = await c.req.json().catch(() => ({})) as { pin?: string }
  if (!body.pin || !/^\d{4,6}$/.test(body.pin)) {
    return c.json({ error: 'PIN harus 4–6 digit angka' }, 400)
  }

  const hash = bcrypt.hashSync(body.pin, 10)
  await db.update(notes).set({ pinHash: hash }).where(eq(notes.id, id))
  return c.json({ ok: true })
})


app.post('/api/notes/:id/copy-to-organization', authMiddleware, async (c) => {
  const id = c.req.param('id')
  const session = c.get('session')
  const body = await c.req.json().catch(() => ({})) as { organizationId: string; pin?: string | null }
  const { organizationId, pin } = body
  if (!organizationId) return c.json({ error: 'organizationId required' }, 400)

  // Verify user membership
  const [membership] = await db.select().from(userOrganizations).where(and(eq(userOrganizations.userId, session.userId), eq(userOrganizations.organizationId, organizationId)))
  if (!membership && session.role !== 'admin') {
    return c.json({ error: 'Anda bukan anggota organisasi ini' }, 403)
  }

  const ownerFilter = await getOwnerFilter(id, session.userId, session.role)
  const [note] = await db.select().from(notes).where(ownerFilter)
  if (!note) return c.json({ error: 'Catatan tidak ditemukan atau Anda tidak memiliki akses' }, 404)

  const [existingChild] = await db.select().from(notes).where(
    and(
      eq(notes.copiedFromId, id),
      eq(notes.organizationId, organizationId),
      eq(notes.type, 'organization')
    )
  )

  let existingParent = null
  if (note.copiedFromId) {
    const [parent] = await db.select().from(notes).where(
      and(
        eq(notes.id, note.copiedFromId),
        eq(notes.organizationId, organizationId),
        eq(notes.type, 'organization')
      )
    )
    existingParent = parent
  }

  if (existingChild || existingParent) {
    return c.json({ error: 'Catatan ini sudah ada di ruang kerja Organisasi (sudah pernah disalin dan masih ada di target)' }, 400)
  }

  let customPinHash = note.pinHash
  if (pin !== undefined) {
    customPinHash = pin ? bcrypt.hashSync(pin, 10) : null
  }

  const now = Date.now()
  const newId = randomUUID()
  await db.insert(notes).values({
    id: newId,
    userId: session.userId,
    organizationId,
    copiedFromId: id,
    type: 'organization',
    title: `${session.username}: ${note.title || 'Catatan Tanpa Judul'}`,
    content: note.content,
    pinHash: customPinHash,
    createdAt: now,
    updatedAt: now
  })

  return c.json({ ok: true, id: newId }, 201)
})

app.post('/api/notes/:id/move-to-organization', authMiddleware, async (c) => {
  const id = c.req.param('id')
  const session = c.get('session')
  const body = await c.req.json().catch(() => ({})) as { organizationId: string; pin?: string | null }
  const { organizationId, pin } = body
  if (!organizationId) return c.json({ error: 'organizationId required' }, 400)

  // Verify user membership
  const [membership] = await db.select().from(userOrganizations).where(and(eq(userOrganizations.userId, session.userId), eq(userOrganizations.organizationId, organizationId)))
  if (!membership && session.role !== 'admin') {
    return c.json({ error: 'Anda bukan anggota organisasi ini' }, 403)
  }

  const ownerFilter = await getOwnerFilter(id, session.userId, session.role)
  const [note] = await db.select().from(notes).where(ownerFilter)
  if (!note) return c.json({ error: 'Catatan tidak ditemukan atau Anda tidak memiliki akses' }, 404)

  let customPinHash = note.pinHash
  if (pin !== undefined) {
    customPinHash = pin ? bcrypt.hashSync(pin, 10) : null
  }

  await db.update(notes)
    .set({ 
      type: 'organization', 
      organizationId, 
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

  let orgName = 'Organisasi'
  if (note.organizationId) {
    const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, note.organizationId))
    if (org?.name) orgName = org.name
  }

  const now = Date.now()
  const newId = randomUUID()
  await db.insert(notes).values({
    id: newId,
    userId: session.userId,
    organizationId: null,
    copiedFromId: id,
    type: 'individual',
    title: `${orgName}: ${note.title || 'Catatan Tanpa Judul'}`,
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

  let orgName = 'Organisasi'
  if (note.organizationId) {
    const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, note.organizationId))
    if (org?.name) orgName = org.name
  }

  await db.update(notes)
    .set({ 
      type: 'individual', 
      organizationId: null, 
      userId: session.userId, 
      title: `${orgName}: ${note.title || 'Catatan Tanpa Judul'}`,
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
  return c.json(await stripAndEnrich(note))
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

  // Create auto-version snapshot if last version is older than 10 minutes or if there are no versions yet
  try {
    const lastHistory = await db.select()
      .from(noteHistory)
      .where(eq(noteHistory.noteId, id))
      .orderBy(desc(noteHistory.createdAt))
      .limit(1)
      
    const now = Date.now()
    if (lastHistory.length === 0 || now - lastHistory[0].createdAt > 10 * 60 * 1000) {
      await db.insert(noteHistory).values({
        id: randomUUID(),
        noteId: id,
        title: updated.title,
        content: updated.content,
        coverImage: updated.coverImage,
        icon: updated.icon,
        createdById: session.userId,
        createdAt: now,
        versionName: 'Penyimpanan Otomatis'
      })
    }
  } catch (err) {
    console.error('Failed to auto-create note history snapshot:', err)
  }

  return c.json(await stripAndEnrich(updated))
})



app.delete('/api/notes/:id', authMiddleware, async (c) => {
  const id = c.req.param('id')
  const session = c.get('session')
  const ownerFilter = await getOwnerFilter(id, session.userId, session.role)
  await db.delete(notes).where(ownerFilter)
  return c.json({ ok: true })
})

// --- VERSION HISTORY ACTIONS ---

app.get('/api/notes/:id/history', authMiddleware, async (c) => {
  const id = c.req.param('id')
  const session = c.get('session')
  const ownerFilter = await getOwnerFilter(id, session.userId, session.role)
  
  const [note] = await db.select().from(notes).where(ownerFilter)
  if (!note) return c.json({ error: 'not found' }, 404)

  const history = await db.select()
    .from(noteHistory)
    .where(eq(noteHistory.noteId, id))
    .orderBy(desc(noteHistory.createdAt))

  return c.json(history)
})

app.post('/api/notes/:id/history', authMiddleware, async (c) => {
  const id = c.req.param('id')
  const session = c.get('session')
  const ownerFilter = await getOwnerFilter(id, session.userId, session.role)
  const body = await c.req.json().catch(() => ({})) as { versionName?: string }
  const versionName = body.versionName?.trim() || 'Snapshot Kustom'

  const [note] = await db.select().from(notes).where(ownerFilter)
  if (!note) return c.json({ error: 'not found' }, 404)

  const newVersion = {
    id: randomUUID(),
    noteId: id,
    title: note.title,
    content: note.content,
    coverImage: note.coverImage,
    icon: note.icon,
    createdById: session.userId,
    createdAt: Date.now(),
    versionName
  }

  await db.insert(noteHistory).values(newVersion)
  return c.json(newVersion)
})

app.post('/api/notes/:id/history/restore/:versionId', authMiddleware, async (c) => {
  const id = c.req.param('id')
  const versionId = c.req.param('versionId')
  const session = c.get('session')
  const ownerFilter = await getOwnerFilter(id, session.userId, session.role)

  const [note] = await db.select().from(notes).where(ownerFilter)
  if (!note) return c.json({ error: 'not found' }, 404)

  const [version] = await db.select()
    .from(noteHistory)
    .where(and(eq(noteHistory.id, versionId), eq(noteHistory.noteId, id)))
  if (!version) return c.json({ error: 'version not found' }, 404)

  await db.update(notes)
    .set({
      title: version.title,
      content: version.content,
      coverImage: version.coverImage,
      icon: version.icon,
      updatedByUserId: session.userId,
      updatedAt: Date.now()
    })
    .where(ownerFilter)

  const [updated] = await db.select().from(notes).where(ownerFilter)
  return c.json(await stripAndEnrich(updated))
})

// --- ATTACHMENT ACTIONS ---

app.post('/api/attachments', authMiddleware, async (c) => {
  const body = await c.req.parseBody()
  const file = body.file as File
  const noteId = body.noteId as string

  if (!file || !noteId) {
    return c.json({ error: 'missing file or noteId' }, 400)
  }

  // Ensure the note exists (especially for RAG dummy note)
  const [existingNote] = await db.select().from(notes).where(eq(notes.id, noteId))
  if (!existingNote) {
    if (noteId === '00000000-0000-0000-0000-000000000000') {
      await db.insert(notes).values({
        id: noteId,
        title: 'RAG Global Chat Attachments',
        content: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    } else {
      return c.json({ error: 'Referenced note not found' }, 404)
    }
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

// --- AI LOGS ADMIN ENDPOINT ---

app.get('/api/admin/ai-logs', adminMiddleware, async (c) => {
  const url = new URL(c.req.url)
  const userId = url.searchParams.get('userId')
  const page = url.searchParams.get('page') || '1'
  const pageSize = url.searchParams.get('pageSize') || '30'

  try {
    const params = new URLSearchParams({ page, page_size: pageSize })
    if (userId) params.set('user_id', userId)
    const forwardRes = await fetch(`${AI_AGENT_URL}/api/admin/sessions?${params}`)
    if (!forwardRes.ok) {
      const errText = await forwardRes.text()
      return c.json({ error: `AI service error: ${errText}` }, forwardRes.status as any)
    }
    const data = await forwardRes.json()

    // Enrich sessions with usernames from web app DB
    if (data.sessions?.length > 0) {
      const userIds = [...new Set(data.sessions.map((s: any) => s.user_id).filter(Boolean))] as string[]
      if (userIds.length > 0) {
        const userRows = await db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.id, userIds))
        const userMap = Object.fromEntries(userRows.map(u => [u.id, u.username]))
        for (const sess of data.sessions) {
          sess.username = sess.user_id ? (userMap[sess.user_id] || null) : null
        }
      }
    }

    return c.json(data)
  } catch (err) {
    return c.json({ error: `Failed to communicate with AI agent: ${String(err)}` }, 500)
  }
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

app.post('/api/ai/diagram', authMiddleware, async (c) => {
  try {
    const body = await c.req.json() as any
    const forwardRes = await fetch(`${AI_AGENT_URL}/api/diagram`, {
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

app.post('/api/documents', authMiddleware, async (c) => {
  try {
    const formData = await c.req.formData()
    const forwardRes = await fetch(`${AI_AGENT_URL}/api/documents`, {
      method: 'POST',
      body: formData,
    })
    if (!forwardRes.ok) {
      const errText = await forwardRes.text()
      return c.json({ error: `AI service error: ${errText}` }, forwardRes.status as any)
    }
    const data = await forwardRes.json()
    return c.json(data)
  } catch (err) {
    return c.json({ error: `Failed to forward document upload: ${String(err)}` }, 500)
  }
})

app.get('/api/documents/', authMiddleware, async (c) => {
  try {
    const forwardRes = await fetch(`${AI_AGENT_URL}/api/documents/`)
    if (!forwardRes.ok) {
      const errText = await forwardRes.text()
      return c.json({ error: `AI service error: ${errText}` }, forwardRes.status as any)
    }
    const data = await forwardRes.json()
    return c.json(data)
  } catch (err) {
    return c.json({ error: `Failed to list documents: ${String(err)}` }, 500)
  }
})

app.get('/api/documents/:documentId', authMiddleware, async (c) => {
  try {
    const documentId = c.req.param('documentId')
    const pageNumber = c.req.query('page_number')
    const url = pageNumber !== undefined
      ? `${AI_AGENT_URL}/api/documents/${documentId}?page_number=${pageNumber}`
      : `${AI_AGENT_URL}/api/documents/${documentId}`
    const forwardRes = await fetch(url)
    if (!forwardRes.ok) {
      const errText = await forwardRes.text()
      return c.json({ error: `AI service error: ${errText}` }, forwardRes.status as any)
    }
    const data = await forwardRes.json()
    return c.json(data)
  } catch (err) {
    return c.json({ error: `Failed to retrieve document: ${String(err)}` }, 500)
  }
})

app.delete('/api/documents/:documentId', authMiddleware, async (c) => {
  try {
    const documentId = c.req.param('documentId')
    const forwardRes = await fetch(`${AI_AGENT_URL}/api/documents/${documentId}`, {
      method: 'DELETE',
    })
    if (!forwardRes.ok) {
      const errText = await forwardRes.text()
      return c.json({ error: `AI service error: ${errText}` }, forwardRes.status as any)
    }
    return c.text('', 204)
  } catch (err) {
    return c.json({ error: `Failed to delete document: ${String(err)}` }, 500)
  }
})

app.get('/api/pages/:pageId', authMiddleware, async (c) => {
  try {
    const pageId = c.req.param('pageId')
    const forwardRes = await fetch(`${AI_AGENT_URL}/api/pages/${pageId}`)
    if (!forwardRes.ok) {
      const errText = await forwardRes.text()
      return c.json({ error: `AI service error: ${errText}` }, forwardRes.status as any)
    }
    const data = await forwardRes.json()
    return c.json(data)
  } catch (err) {
    return c.json({ error: `Failed to retrieve page: ${String(err)}` }, 500)
  }
})

app.post('/api/queries', authMiddleware, async (c) => {
  try {
    const body = await c.req.json()
    const forwardRes = await fetch(`${AI_AGENT_URL}/api/queries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!forwardRes.ok) {
      const errText = await forwardRes.text()
      return c.json({ error: `AI service error: ${errText}` }, forwardRes.status as any)
    }
    const data = await forwardRes.json()
    return c.json(data)
  } catch (err) {
    return c.json({ error: `Failed to query: ${String(err)}` }, 500)
  }
})

app.post('/api/queries/chat', authMiddleware, async (c) => {
  try {
    const body = await c.req.json()
    const forwardRes = await fetch(`${AI_AGENT_URL}/api/queries/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!forwardRes.ok) {
      const errText = await forwardRes.text()
      return c.json({ error: `AI service error: ${errText}` }, forwardRes.status as any)
    }
    const data = await forwardRes.json()
    return c.json(data)
  } catch (err) {
    return c.json({ error: `Failed to perform chat with agent: ${String(err)}` }, 500)
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
