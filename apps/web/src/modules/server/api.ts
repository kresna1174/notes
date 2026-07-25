import type { IncomingMessage, ServerResponse } from 'node:http'
import { createReadStream } from 'node:fs'
import { db, initDb } from '../shared/db'
import { notes, attachments, users, organizations, userOrganizations, noteHistory, chatSessions, chatMessages, betterAuthAccount, passwordResetTokens, aiSkills } from '../../../drizzle/schema'
import { desc, eq, and, sql, or, inArray } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { saveFile, getFilePath, deleteFile } from '../shared/storage'
import bcrypt from 'bcryptjs'
import nodemailer from 'nodemailer'
import { auth } from './auth-oauth'

// Run DB initialization on module load to guarantee new tables exist in running dev server
initDb().catch(err => console.error('[api.ts] DB initialization failed:', err))


// Hono Imports
import { Hono, type Context } from 'hono'
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie'
import { stream } from 'hono/streaming'
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

const COOKIE_SECRET = process.env.BETTER_AUTH_SECRET || 'dev-secret-change-in-production'

async function getSession(c: Context<Env>) {
  const sessionToken = await getSignedCookie(c, COOKIE_SECRET, 'session').catch(() => null)
  const oauthToken = await getSignedCookie(c, COOKIE_SECRET, 'better-auth.session_token').catch(() => null)
  const token = (sessionToken || null) ?? (oauthToken === false ? null : oauthToken)
  if (!token) return null
  const result = await db.execute(sql`SELECT user_id as "userId", username, role FROM sessions WHERE token = ${token}`)
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
  const session = c.get('session') ?? await getSession(c)
  if (!session) return c.json({ error: 'unauthenticated' }, 401)
  if (session.role !== 'admin') return c.json({ error: 'forbidden' }, 403)
  c.set('session', session)
  await next()
})


// --- AUTH ENDPOINTS ---

// better-auth handles OAuth flows — only intercepts paths it knows, passes unknown paths through
app.on(['GET', 'POST'], '/api/auth/*', async (c, next) => {
  const res = await auth.handler(c.req.raw)
  if (res.status !== 404) return res
  await next()
})

app.post('/api/auth/login', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { username?: string; password?: string }
  const { username, password } = body
  if (!username || !password) {
    return c.json({ error: 'username and password required' }, 400)
  }
  const [user] = await db.select().from(users).where(eq(users.username, username))
  if (!user || !user.passwordHash || !bcrypt.compareSync(password, user.passwordHash)) {
    return c.json({ error: 'Invalid username or password' }, 401)
  }
  const token = randomUUID()
  await db.execute(sql`INSERT INTO sessions (token, user_id, username, role, created_at) VALUES (${token}, ${user.id}, ${user.username}, ${user.role}, ${Date.now()})`)
  await setSignedCookie(c, 'session', token, COOKIE_SECRET, { path: '/', httpOnly: true, sameSite: 'Strict' })
  const orgs = await getUserOrganizations(user.id)
  return c.json({ userId: user.id, username: user.username, role: user.role, organizations: orgs })
})

app.post('/api/auth/logout', async (c) => {
  const sessionToken = await getSignedCookie(c, COOKIE_SECRET, 'session').catch(() => null)
  const oauthToken = await getSignedCookie(c, COOKIE_SECRET, 'better-auth.session_token').catch(() => null)
  const token = (sessionToken || null) ?? (oauthToken === false ? null : oauthToken)
  if (token) {
    await db.execute(sql`DELETE FROM sessions WHERE token = ${token}`)
  }
  deleteCookie(c, 'session', { path: '/' })
  deleteCookie(c, 'better-auth.session_token', { path: '/' })
  return c.json({ ok: true })
})

app.get('/api/auth/me', async (c) => {
  const session = await getSession(c)
  if (!session) {
    return c.json({ error: 'unauthenticated' }, 401)
  }
  const [user] = await db.select({ email: users.email, passwordHash: users.passwordHash }).from(users).where(eq(users.id, session.userId))
  const orgs = await getUserOrganizations(session.userId)
  const providers = await db
    .select({ provider: betterAuthAccount.providerId })
    .from(betterAuthAccount)
    .where(eq(betterAuthAccount.userId, session.userId))
  return c.json({
    ...session,
    email: user?.email ?? null,
    hasPassword: !!user?.passwordHash,
    connectedProviders: providers.map(p => p.provider),
    organizations: orgs,
  })
})

app.delete('/api/oauth/accounts/:provider', authMiddleware, async (c) => {
  const session = c.get('session')
  const provider = c.req.param('provider')

  // Guard: refuse if this is the only auth method
  const [user] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, session.userId))
  const remaining = await db
    .select({ id: betterAuthAccount.id })
    .from(betterAuthAccount)
    .where(eq(betterAuthAccount.userId, session.userId))

  if (!user?.passwordHash && remaining.length <= 1) {
    return c.json({ error: 'Cannot disconnect your only login method. Set a password first.' }, 400)
  }

  await db
    .delete(betterAuthAccount)
    .where(and(eq(betterAuthAccount.userId, session.userId), eq(betterAuthAccount.providerId, provider)))

  return c.json({ ok: true })
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
  await db.insert(users).values({ id, username: cleanUsername, passwordHash: hash, role: 'viewer', status: 'approved', createdAt: Date.now() })
  return c.json({ id, username: cleanUsername, status: 'approved' }, 201)
})

app.post('/api/auth/change-username', authMiddleware, async (c) => {
  const session = c.get('session')
  const body = await c.req.json().catch(() => ({})) as { username?: string }
  const newUsername = body.username?.trim()
  if (!newUsername) return c.json({ error: 'username required' }, 400)
  if (!/^[a-zA-Z0-9_]{3,32}$/.test(newUsername)) {
    return c.json({ error: 'Username must be 3–32 chars, letters/numbers/underscores only' }, 400)
  }
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.username, newUsername)).limit(1)
  if (existing) return c.json({ error: 'Username already taken' }, 409)
  await db.update(users).set({ username: newUsername }).where(eq(users.id, session.userId))
  // Update all sessions for this user
  await db.execute(sql`UPDATE sessions SET username = ${newUsername} WHERE user_id = ${session.userId}`)
  return c.json({ ok: true, username: newUsername })
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
  if (!user.passwordHash || !bcrypt.compareSync(oldPassword, user.passwordHash)) {
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

function createMailTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
}

app.post('/api/auth/forgot-password', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { email?: string }
  const { email } = body
  if (!email) return c.json({ error: 'email required' }, 400)

  const [user] = await db.select({ id: users.id, email: users.email })
    .from(users).where(eq(users.email, email.toLowerCase().trim())).limit(1)

  // Always respond OK — don't leak whether email exists
  if (!user || !user.email) return c.json({ ok: true })

  // Invalidate any existing unused tokens for this user
  await db.execute(sql`
    UPDATE password_reset_tokens SET used_at = ${Date.now()}
    WHERE user_id = ${user.id} AND used_at IS NULL
  `)

  const token = randomUUID()
  const expiresAt = Date.now() + 10 * 60 * 1000 // 10 minutes
  await db.insert(passwordResetTokens).values({
    id: randomUUID(),
    userId: user.id,
    token,
    expiresAt,
    createdAt: Date.now(),
  })

  const baseUrl = process.env.BETTER_AUTH_URL || 'http://localhost:3000'
  const resetLink = `${baseUrl}/reset-password?token=${token}`

  if (!process.env.SMTP_HOST) {
    // Dev: log link to console instead of sending email
    console.log(`[forgot-password] Reset link for ${email}: ${resetLink}`)
  } else {
    const transporter = createMailTransport()
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: user.email,
      subject: 'Reset your password',
      text: `Click the link below to reset your password. This link expires in 10 minutes.\n\n${resetLink}\n\nIf you didn't request this, ignore this email.`,
      html: `<p>Click the link below to reset your password. This link expires in <strong>10 minutes</strong>.</p><p><a href="${resetLink}">${resetLink}</a></p><p>If you didn't request this, ignore this email.</p>`,
    })
  }

  return c.json({ ok: true })
})

app.post('/api/password-reset/confirm', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { token?: string; password?: string }
  const { token, password } = body
  if (!token || !password) return c.json({ error: 'token and password required' }, 400)
  if (password.length < 6) return c.json({ error: 'Password must be at least 6 characters' }, 400)

  const [row] = await db.select().from(passwordResetTokens)
    .where(eq(passwordResetTokens.token, token)).limit(1)

  if (!row) return c.json({ error: 'invalid_token' }, 400)
  if (row.usedAt) return c.json({ error: 'expired_token' }, 400)
  if (row.expiresAt < Date.now()) return c.json({ error: 'expired_token' }, 400)

  const hash = bcrypt.hashSync(password, 10)
  await db.update(users).set({ passwordHash: hash }).where(eq(users.id, row.userId))
  await db.execute(sql`
    UPDATE password_reset_tokens SET used_at = ${Date.now()} WHERE token = ${token}
  `)

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

// --- AI SKILLS ENDPOINTS (admin only) ---

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'skill'
}

// Turn a name into a slug that's unique across ai_skills, appending -2, -3, … on collision.
async function uniqueSkillSlug(name: string): Promise<string> {
  const base = slugify(name)
  const existing = await db.select({ slug: aiSkills.slug }).from(aiSkills)
  const taken = new Set(existing.map(r => r.slug).filter((s): s is string => !!s))
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

app.get('/api/admin/skills', adminMiddleware, async (c) => {
  const all = await db.select().from(aiSkills).orderBy(desc(aiSkills.updatedAt))
  return c.json(all)
})

app.post('/api/admin/skills', adminMiddleware, async (c) => {
  const body = await c.req.json().catch(() => ({})) as { name?: string; description?: string; content?: string; enabled?: boolean }
  const name = body.name?.trim()
  if (!name) return c.json({ error: 'name required' }, 400)
  const now = Date.now()
  const id = randomUUID()
  await db.insert(aiSkills).values({
    id,
    name,
    slug: await uniqueSkillSlug(name),
    description: body.description?.trim() ?? null,
    content: body.content ?? '',
    enabled: body.enabled ?? true,
    createdAt: now,
    updatedAt: now,
  })
  return c.json({ id }, 201)
})

app.put('/api/admin/skills/:id', adminMiddleware, async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({})) as { name?: string; description?: string; content?: string; enabled?: boolean }
  const patch: Record<string, unknown> = { updatedAt: Date.now() }
  if (body.name !== undefined) {
    const name = body.name.trim()
    if (!name) return c.json({ error: 'name required' }, 400)
    patch.name = name
  }
  if (body.description !== undefined) patch.description = body.description?.trim() ?? null
  if (body.content !== undefined) patch.content = body.content
  if (body.enabled !== undefined) patch.enabled = body.enabled
  await db.update(aiSkills).set(patch).where(eq(aiSkills.id, id))
  return c.json({ ok: true })
})

app.delete('/api/admin/skills/:id', adminMiddleware, async (c) => {
  const id = c.req.param('id')
  await db.delete(aiSkills).where(eq(aiSkills.id, id))
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
  const body = await c.req.json().catch(() => ({})) as { organizationId?: string | null; type?: 'individual' | 'organization' | null; parentId?: string | null } | null
  const parentId = body?.parentId ?? null
  const organizationId = body?.organizationId ?? null
  const type = body?.type || (organizationId ? 'organization' : 'individual')
  const now = Date.now()
  const id = randomUUID()
  const note = { id, parentId, userId: session.userId, organizationId, type, title: '', content: '{"type":"doc","content":[]}', createdAt: now, updatedAt: now }
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
  const body = await c.req.json().catch(() => ({})) as { title?: string; content?: string; coverImage?: string | null; icon?: string | null; parentId?: string | null }
  const { title, content, coverImage, icon, parentId } = body
  await db.update(notes)
    .set({
      ...(title !== undefined && { title }),
      ...(content !== undefined && { content }),
      ...(coverImage !== undefined && { coverImage }),
      ...(icon !== undefined && { icon }),
      ...(parentId !== undefined && { parentId }),
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

  if (!file) {
    return c.json({ error: 'missing file' }, 400)
  }

  // If a noteId is provided, verify it exists
  if (noteId) {
    const [existingNote] = await db.select().from(notes).where(eq(notes.id, noteId))
    if (!existingNote) {
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

// --- PERSISTENT CHAT HISTORY ENDPOINTS ---

app.get('/api/chat-sessions', authMiddleware, async (c) => {
  const session = c.get('session')
  const type = c.req.query('type') || 'rag'
  const noteId = c.req.query('noteId')
  try {
    const conditions = [
      eq(chatSessions.userId, session.userId),
      eq(chatSessions.type, type)
    ]
    if (type === 'note' && noteId) {
      conditions.push(eq(chatSessions.noteId, noteId))
    }
    const sessions = await db
      .select()
      .from(chatSessions)
      .where(and(...conditions))
      .orderBy(desc(chatSessions.updatedAt))
    return c.json(sessions)
  } catch (err) {
    return c.json({ error: `Failed to retrieve chat sessions: ${String(err)}` }, 500)
  }
})

app.post('/api/chat-sessions', authMiddleware, async (c) => {
  const session = c.get('session')
  try {
    const body = await c.req.json().catch(() => ({})) as any
    const title = body.title?.trim() || 'New Chat'
    const type = body.type || 'rag'
    const noteId = body.noteId || null
    const newSession = {
      id: randomUUID(),
      userId: session.userId,
      title: title,
      type: type,
      noteId: noteId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await db.insert(chatSessions).values(newSession)
    return c.json(newSession)
  } catch (err) {
    return c.json({ error: `Failed to create chat session: ${String(err)}` }, 500)
  }
})

app.put('/api/chat-sessions/:id', authMiddleware, async (c) => {
  const sessionId = c.req.param('id')
  const session = c.get('session')
  try {
    const body = await c.req.json() as any
    const title = body.title?.trim()
    const noteId = body.hasOwnProperty('noteId') ? (body.noteId === 'none' ? null : body.noteId) : undefined

    const [existing] = await db
      .select()
      .from(chatSessions)
      .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, session.userId)))
    if (!existing) {
      return c.json({ error: 'Chat session not found' }, 404)
    }

    const updateData: any = { updatedAt: Date.now() }
    if (title !== undefined) updateData.title = title
    if (noteId !== undefined) updateData.noteId = noteId

    await db
      .update(chatSessions)
      .set(updateData)
      .where(eq(chatSessions.id, sessionId))

    return c.json({ success: true, id: sessionId, title: title || existing.title, noteId: noteId !== undefined ? noteId : existing.noteId })
  } catch (err) {
    return c.json({ error: `Failed to update chat session: ${String(err)}` }, 500)
  }
})

app.delete('/api/chat-sessions/:id', authMiddleware, async (c) => {
  const sessionId = c.req.param('id')
  const session = c.get('session')
  try {
    const [existing] = await db
      .select()
      .from(chatSessions)
      .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, session.userId)))
    if (!existing) {
      return c.json({ error: 'Chat session not found' }, 404)
    }

    await db.delete(chatSessions).where(eq(chatSessions.id, sessionId))
    return c.json({ ok: true })
  } catch (err) {
    return c.json({ error: `Failed to delete chat session: ${String(err)}` }, 500)
  }
})

app.get('/api/chat-sessions/:id/messages', authMiddleware, async (c) => {
  const sessionId = c.req.param('id')
  const session = c.get('session')
  try {
    const [chatSess] = await db
      .select()
      .from(chatSessions)
      .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, session.userId)))
    if (!chatSess) {
      return c.json({ error: 'Chat session not found' }, 404)
    }

    const messages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(chatMessages.createdAt)
    return c.json(messages)
  } catch (err) {
    return c.json({ error: `Failed to retrieve messages: ${String(err)}` }, 500)
  }
})

// --- AI AGENT PROXY ENDPOINTS ---

app.get('/api/ai/chat/history/:id', authMiddleware, async (c) => {
  const sessionId = c.req.param('id')
  const session = c.get('session')
  try {
    // If it is a persistent database chat session, load from Postgres first
    const [dbSession] = await db
      .select()
      .from(chatSessions)
      .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, session.userId)))
    if (dbSession) {
      const messages = await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.sessionId, sessionId))
        .orderBy(chatMessages.createdAt)
      
      // Map schema messages back to the structure expected by useChat
      // Role is either 'user' or 'assistant'.
      const formatted = messages.map(m => ({
        role: m.role,
        content: m.content,
        type: 'completed' // Tell useChat this is a completed markdown response
      }))
      return c.json({ messages: formatted })
    }

    // Otherwise, fall back to Python agent history
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

    // Check if session_id is a valid persistent session
    let isPersistentSession = false
    if (body.session_id) {
      const [dbSession] = await db
        .select()
        .from(chatSessions)
        .where(and(eq(chatSessions.id, body.session_id), eq(chatSessions.userId, session.userId)))
      if (dbSession) {
        isPersistentSession = true

        // If the session has noteId, retrieve and inject note content for context
        if (dbSession.noteId) {
          const [noteData] = await db
            .select()
            .from(notes)
            .where(eq(notes.id, dbSession.noteId))
          if (noteData) {
            body.note_title = noteData.title || ''
            body.note_content = noteData.content || ''
          }
        }

        // Save the user's message to Postgres!
        const lastMessage = body.messages && Array.isArray(body.messages)
          ? body.messages[body.messages.length - 1]
          : null
        let userMessageContent = ''
        if (body.message) {
          userMessageContent = body.message
        } else if (lastMessage) {
          if (typeof lastMessage.content === 'string' && lastMessage.content) {
            userMessageContent = lastMessage.content
          } else if (Array.isArray(lastMessage.parts)) {
            const textPart = lastMessage.parts.find((p: any) => p.type === 'text')
            if (textPart && typeof textPart.text === 'string') {
              userMessageContent = textPart.text
            }
          }
        }

        await db.insert(chatMessages).values({
          id: randomUUID(),
          sessionId: body.session_id,
          role: 'user',
          content: userMessageContent || '',
          createdAt: Date.now()
        }).catch(err => console.error('[Save User Msg Error]', err))
      }
    }

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
      
      const decoder = new TextDecoder()
      let assistantResponseText = ''
      let buffer = ''
      
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            // Save the assistant's message when the stream is completed successfully!
            if (isPersistentSession && assistantResponseText.trim().length > 0) {
              await db.insert(chatMessages).values({
                id: randomUUID(),
                sessionId: body.session_id,
                role: 'assistant',
                content: assistantResponseText,
                createdAt: Date.now()
              }).catch(err => console.error('[Save Assistant Msg Error]', err))

              // Also update the session's updatedAt time
              await db.update(chatSessions)
                .set({ updatedAt: Date.now() })
                .where(eq(chatSessions.id, body.session_id))
                .catch(err => console.error('[Update Sess UpdatedAt Error]', err))
            }
            break
          }
          
          await s.write(value)

          // Decode and reconstruct the assistant's text
          const chunkStr = decoder.decode(value, { stream: true })
          buffer += chunkStr
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) {
            const cleanLine = line.trim()
            if (cleanLine.startsWith('data: ')) {
              const dataStr = cleanLine.substring(6)
              if (dataStr === '[DONE]') continue
              try {
                const parsed = JSON.parse(dataStr)
                if (parsed.type === 'text-delta' && parsed.delta) {
                  assistantResponseText += parsed.delta
                }
              } catch (e) {
                // Ignore parse errors for tool-calls or non-JSON parts
              }
            }
          }
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
    return c.body(null, 204)
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

// ── Wiki Proxy Routes ─────────────────────────────────────────────────────────

// GET /api/wiki/pages — list all wiki pages
app.get('/api/wiki/pages', authMiddleware, async (c) => {
  try {
    const forwardRes = await fetch(`${AI_AGENT_URL}/api/wiki/pages`)
    if (!forwardRes.ok) {
      const errText = await forwardRes.text()
      return c.json({ error: `AI service error: ${errText}` }, forwardRes.status as any)
    }
    return c.json(await forwardRes.json())
  } catch (err) {
    return c.json({ error: `Failed to list wiki pages: ${String(err)}` }, 500)
  }
})

// GET /api/wiki/index — structured index by category
app.get('/api/wiki/index', authMiddleware, async (c) => {
  try {
    const forwardRes = await fetch(`${AI_AGENT_URL}/api/wiki/index`)
    if (!forwardRes.ok) {
      const errText = await forwardRes.text()
      return c.json({ error: `AI service error: ${errText}` }, forwardRes.status as any)
    }
    return c.json(await forwardRes.json())
  } catch (err) {
    return c.json({ error: `Failed to get wiki index: ${String(err)}` }, 500)
  }
})

// GET /api/wiki/log — recent ingest logs
app.get('/api/wiki/log', authMiddleware, async (c) => {
  try {
    const forwardRes = await fetch(`${AI_AGENT_URL}/api/wiki/log`)
    if (!forwardRes.ok) {
      const errText = await forwardRes.text()
      return c.json({ error: `AI service error: ${errText}` }, forwardRes.status as any)
    }
    return c.json(await forwardRes.json())
  } catch (err) {
    return c.json({ error: `Failed to get wiki log: ${String(err)}` }, 500)
  }
})

// GET /api/wiki/graph — graph nodes + edges
app.get('/api/wiki/graph', authMiddleware, async (c) => {
  try {
    const forwardRes = await fetch(`${AI_AGENT_URL}/api/wiki/graph`)
    if (!forwardRes.ok) {
      const errText = await forwardRes.text()
      return c.json({ error: `AI service error: ${errText}` }, forwardRes.status as any)
    }
    return c.json(await forwardRes.json())
  } catch (err) {
    return c.json({ error: `Failed to get wiki graph: ${String(err)}` }, 500)
  }
})

// GET /api/wiki/search?q=... — BM25 full-text search
app.get('/api/wiki/search', authMiddleware, async (c) => {
  try {
    const q = c.req.query('q') || ''
    const forwardRes = await fetch(`${AI_AGENT_URL}/api/wiki/search?q=${encodeURIComponent(q)}`)
    if (!forwardRes.ok) {
      const errText = await forwardRes.text()
      return c.json({ error: `AI service error: ${errText}` }, forwardRes.status as any)
    }
    return c.json(await forwardRes.json())
  } catch (err) {
    return c.json({ error: `Failed to search wiki: ${String(err)}` }, 500)
  }
})

// POST /api/wiki/ingest — trigger WikiIngestAgent for a note
app.post('/api/wiki/ingest', authMiddleware, async (c) => {
  try {
    const body = await c.req.json()
    const forwardRes = await fetch(`${AI_AGENT_URL}/api/wiki/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!forwardRes.ok) {
      const errText = await forwardRes.text()
      return c.json({ error: `AI service error: ${errText}` }, forwardRes.status as any)
    }
    return c.json(await forwardRes.json())
  } catch (err) {
    return c.json({ error: `Failed to ingest note to wiki: ${String(err)}` }, 500)
  }
})

// POST /api/wiki/lint — run wiki health check
app.post('/api/wiki/lint', authMiddleware, async (c) => {
  try {
    const forwardRes = await fetch(`${AI_AGENT_URL}/api/wiki/lint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    if (!forwardRes.ok) {
      const errText = await forwardRes.text()
      return c.json({ error: `AI service error: ${errText}` }, forwardRes.status as any)
    }
    return c.json(await forwardRes.json())
  } catch (err) {
    return c.json({ error: `Failed to run wiki lint: ${String(err)}` }, 500)
  }
})

// GET /api/wiki/pages/:slug — get page by slug (must be after specific routes)
app.get('/api/wiki/pages/*', authMiddleware, async (c) => {
  try {
    const slug = c.req.path.replace('/api/wiki/pages/', '')
    const forwardRes = await fetch(`${AI_AGENT_URL}/api/wiki/pages/${slug}`)
    if (!forwardRes.ok) {
      const errText = await forwardRes.text()
      return c.json({ error: `AI service error: ${errText}` }, forwardRes.status as any)
    }
    return c.json(await forwardRes.json())
  } catch (err) {
    return c.json({ error: `Failed to get wiki page: ${String(err)}` }, 500)
  }
})

// PUT /api/wiki/pages/:slug — manually update a wiki page
app.put('/api/wiki/pages/*', authMiddleware, async (c) => {
  try {
    const slug = c.req.path.replace('/api/wiki/pages/', '')
    const body = await c.req.json()
    const forwardRes = await fetch(`${AI_AGENT_URL}/api/wiki/pages/${slug}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!forwardRes.ok) {
      const errText = await forwardRes.text()
      return c.json({ error: `AI service error: ${errText}` }, forwardRes.status as any)
    }
    return c.json(await forwardRes.json())
  } catch (err) {
    return c.json({ error: `Failed to update wiki page: ${String(err)}` }, 500)
  }
})

// DELETE /api/wiki/pages/:slug — delete a wiki page
app.delete('/api/wiki/pages/*', authMiddleware, async (c) => {
  try {
    const slug = c.req.path.replace('/api/wiki/pages/', '')
    const forwardRes = await fetch(`${AI_AGENT_URL}/api/wiki/pages/${slug}`, {
      method: 'DELETE',
    })
    if (!forwardRes.ok) {
      const errText = await forwardRes.text()
      return c.json({ error: `AI service error: ${errText}` }, forwardRes.status as any)
    }
    return c.json(await forwardRes.json())
  } catch (err) {
    return c.json({ error: `Failed to delete wiki page: ${String(err)}` }, 500)
  }
})

// POST /api/ai/notes-index/:noteId — trigger note indexing
app.post('/api/ai/notes-index/:noteId', authMiddleware, async (c) => {
  try {
    const noteId = c.req.param('noteId')
    const body = await c.req.json()
    const forwardRes = await fetch(`${AI_AGENT_URL}/api/notes-index/${noteId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!forwardRes.ok) {
      const errText = await forwardRes.text()
      return c.json({ error: `AI service error: ${errText}` }, forwardRes.status as any)
    }
    return c.json(await forwardRes.json())
  } catch (err) {
    return c.json({ error: `Failed to index note: ${String(err)}` }, 500)
  }
})

// DELETE /api/ai/notes-index/:noteId — remove note from index
app.delete('/api/ai/notes-index/:noteId', authMiddleware, async (c) => {
  try {
    const noteId = c.req.param('noteId')
    const forwardRes = await fetch(`${AI_AGENT_URL}/api/notes-index/${noteId}`, {
      method: 'DELETE',
    })
    if (!forwardRes.ok) {
      const errText = await forwardRes.text()
      return c.json({ error: `AI service error: ${errText}` }, forwardRes.status as any)
    }
    return c.json(await forwardRes.json())
  } catch (err) {
    return c.json({ error: `Failed to remove note index: ${String(err)}` }, 500)
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
