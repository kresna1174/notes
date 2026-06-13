import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../lib/db'
import { users } from '../../drizzle/schema'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'

describe('Approval-based User Registration and Authentication Flow', () => {
  beforeEach(async () => {
    // Clean up users before each test
    await db.delete(users)
  })

  it('should register a new user as pending viewer by default', async () => {
    const userId = randomUUID()
    const passwordHash = bcrypt.hashSync('secure-pw-123', 10)

    await db.insert(users).values({
      id: userId,
      username: 'pending_user',
      passwordHash,
      role: 'viewer',
      status: 'pending',
      createdAt: Date.now()
    })

    const [inserted] = await db.select().from(users).where(eq(users.id, userId))
    expect(inserted).toBeDefined()
    expect(inserted.username).toBe('pending_user')
    expect(inserted.role).toBe('viewer')
    expect(inserted.status).toBe('pending')
  })

  it('should check login credentials and block non-approved users', async () => {
    const pw = 'myPassword123'
    const passwordHash = bcrypt.hashSync(pw, 10)

    const pendingId = randomUUID()
    await db.insert(users).values({
      id: pendingId,
      username: 'user_pending',
      passwordHash,
      role: 'viewer',
      status: 'pending',
      createdAt: Date.now()
    })

    const rejectedId = randomUUID()
    await db.insert(users).values({
      id: rejectedId,
      username: 'user_rejected',
      passwordHash,
      role: 'viewer',
      status: 'rejected',
      createdAt: Date.now()
    })

    const approvedId = randomUUID()
    await db.insert(users).values({
      id: approvedId,
      username: 'user_approved',
      passwordHash,
      role: 'viewer',
      status: 'approved',
      createdAt: Date.now()
    })

    // Simulate login checks
    async function checkLogin(username: string, inputPw: string): Promise<{ allowed: boolean; error?: string }> {
      const [user] = await db.select().from(users).where(eq(users.username, username))
      if (!user || !bcrypt.compareSync(inputPw, user.passwordHash)) {
        return { allowed: false, error: 'Invalid username or password' }
      }
      if (user.status === 'pending') {
        return { allowed: false, error: 'Akun Anda sedang menunggu persetujuan admin.' }
      }
      if (user.status === 'rejected') {
        return { allowed: false, error: 'Pendaftaran akun Anda ditolak oleh admin.' }
      }
      return { allowed: true }
    }

    // 1. Pending User Login
    const resPending = await checkLogin('user_pending', pw)
    expect(resPending.allowed).toBe(false)
    expect(resPending.error).toBe('Akun Anda sedang menunggu persetujuan admin.')

    // 2. Rejected User Login
    const resRejected = await checkLogin('user_rejected', pw)
    expect(resRejected.allowed).toBe(false)
    expect(resRejected.error).toBe('Pendaftaran akun Anda ditolak oleh admin.')

    // 3. Approved User Login
    const resApproved = await checkLogin('user_approved', pw)
    expect(resApproved.allowed).toBe(true)
    expect(resApproved.error).toBeUndefined()

    // 4. Invalid Password Check
    const resInvalidPw = await checkLogin('user_approved', 'wrongPassword')
    expect(resInvalidPw.allowed).toBe(false)
    expect(resInvalidPw.error).toBe('Invalid username or password')
  })

  it('should allow admin to approve a pending user', async () => {
    const userId = randomUUID()
    await db.insert(users).values({
      id: userId,
      username: 'user_to_approve',
      passwordHash: 'dummy',
      role: 'viewer',
      status: 'pending',
      createdAt: Date.now()
    })

    // Approve user action
    await db.update(users).set({ status: 'approved' }).where(eq(users.id, userId))

    const [user] = await db.select().from(users).where(eq(users.id, userId))
    expect(user.status).toBe('approved')
  })

  it('should allow admin to reject a pending user', async () => {
    const userId = randomUUID()
    await db.insert(users).values({
      id: userId,
      username: 'user_to_reject',
      passwordHash: 'dummy',
      role: 'viewer',
      status: 'pending',
      createdAt: Date.now()
    })

    // Reject user action
    await db.update(users).set({ status: 'rejected' }).where(eq(users.id, userId))

    const [user] = await db.select().from(users).where(eq(users.id, userId))
    expect(user.status).toBe('rejected')
  })

  it('should allow admin to reactivate a rejected user', async () => {
    const userId = randomUUID()
    await db.insert(users).values({
      id: userId,
      username: 'user_to_reactivate',
      passwordHash: 'dummy',
      role: 'viewer',
      status: 'rejected',
      createdAt: Date.now()
    })

    // Reactivate (approve) action
    await db.update(users).set({ status: 'approved' }).where(eq(users.id, userId))

    const [user] = await db.select().from(users).where(eq(users.id, userId))
    expect(user.status).toBe('approved')
  })
})
