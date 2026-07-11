import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../shared/db'
import { notes, users, organizations, userOrganizations } from '../../../drizzle/schema'
import { eq, and } from 'drizzle-orm'
import { randomUUID } from 'crypto'

describe('Copy Note Two-Way Duplicate Verification', () => {
  let userId: string
  let orgId: string
  let adminId: string

  beforeEach(async () => {
    // Clean up notes for clean tests
    await db.delete(notes)
    await db.delete(users)
    await db.delete(userOrganizations)
    await db.delete(organizations)

    userId = randomUUID()
    orgId = randomUUID()
    adminId = randomUUID()

    // Insert dummy organization and users
    await db.insert(organizations).values({
      id: orgId,
      name: 'Test Org',
      createdAt: Date.now()
    })

    await db.insert(users).values({
      id: userId,
      username: 'user1',
      passwordHash: 'dummy',
      role: 'viewer',
      status: 'approved',
      createdAt: Date.now()
    })

    await db.insert(users).values({
      id: adminId,
      username: 'admin',
      passwordHash: 'dummy',
      role: 'admin',
      status: 'approved',
      createdAt: Date.now()
    })

    // Assign memberships
    await db.insert(userOrganizations).values({
      userId: userId,
      organizationId: orgId
    })
    await db.insert(userOrganizations).values({
      userId: adminId,
      organizationId: orgId
    })
  })

  it('should handle copying individual notes to organization and prevent duplicates', async () => {
    const noteId = randomUUID()
    // 1. Create individual note A
    await db.insert(notes).values({
      id: noteId,
      userId: userId,
      title: 'Individual Note A',
      content: '{}',
      type: 'individual',
      createdAt: Date.now(),
      updatedAt: Date.now()
    })

    // Helper to simulate endpoint check for copy-to-organization
    async function canCopyToOrg(id: string, targetOrgId: string) {
      // Duplicate checks in copy-to-organization
      const [existingChild] = await db.select().from(notes).where(
        and(
          eq(notes.copiedFromId, id),
          eq(notes.organizationId, targetOrgId),
          eq(notes.type, 'organization')
        )
      )

      const [note] = await db.select().from(notes).where(eq(notes.id, id))
      let existingParent = null
      if (note?.copiedFromId) {
        const [parent] = await db.select().from(notes).where(
          and(
            eq(notes.id, note.copiedFromId),
            eq(notes.organizationId, targetOrgId),
            eq(notes.type, 'organization')
          )
        )
        existingParent = parent
      }

      return !(existingChild || existingParent)
    }

    // First copy should be allowed
    let allowed = await canCopyToOrg(noteId, orgId)
    expect(allowed).toBe(true)

    // Perform copy
    const orgNoteId = randomUUID()
    await db.insert(notes).values({
      id: orgNoteId,
      userId: userId,
      organizationId: orgId,
      copiedFromId: noteId,
      type: 'organization',
      title: 'Org Note B',
      content: '{}',
      createdAt: Date.now(),
      updatedAt: Date.now()
    })

    // Second copy should be blocked because child copy exists in organization
    allowed = await canCopyToOrg(noteId, orgId)
    expect(allowed).toBe(false)

    // Delete the organization note copy
    await db.delete(notes).where(eq(notes.id, orgNoteId))

    // Copy should be allowed again because copy no longer exists in organization
    allowed = await canCopyToOrg(noteId, orgId)
    expect(allowed).toBe(true)
  })

  it('should handle copying organization notes back to personal workspace and prevent duplicates', async () => {
    const orgNoteId = randomUUID()
    const originalIndividualId = randomUUID()

    // 1. Create individual note A
    await db.insert(notes).values({
      id: originalIndividualId,
      userId: userId,
      title: 'Original Individual Note A',
      content: '{}',
      type: 'individual',
      createdAt: Date.now(),
      updatedAt: Date.now()
    })

    // 2. Create organization note B copied from A
    await db.insert(notes).values({
      id: orgNoteId,
      userId: userId,
      organizationId: orgId,
      copiedFromId: originalIndividualId,
      type: 'organization',
      title: 'Org Note B',
      content: '{}',
      createdAt: Date.now(),
      updatedAt: Date.now()
    })

    // Helper to simulate endpoint check for copy-to-personal
    async function canCopyToPersonal(id: string, targetUserId: string) {
      // Duplicate checks in copy-to-personal
      const [existingChild] = await db.select().from(notes).where(
        and(
          eq(notes.copiedFromId, id),
          eq(notes.userId, targetUserId),
          eq(notes.type, 'individual')
        )
      )

      const [note] = await db.select().from(notes).where(eq(notes.id, id))
      let existingParent = null
      if (note?.copiedFromId) {
        const [parent] = await db.select().from(notes).where(
          and(
            eq(notes.id, note.copiedFromId),
            eq(notes.userId, targetUserId),
            eq(notes.type, 'individual')
          )
        )
        existingParent = parent
      }

      return !(existingChild || existingParent)
    }

    // Try to copy organization note B to personal workspace.
    // It should be blocked because the original note A (parent) is still in the personal workspace.
    let allowed = await canCopyToPersonal(orgNoteId, userId)
    expect(allowed).toBe(false)

    // Delete the original individual note A
    await db.delete(notes).where(eq(notes.id, originalIndividualId))

    // Now, copy should be allowed because original individual note A is gone
    allowed = await canCopyToPersonal(orgNoteId, userId)
    expect(allowed).toBe(true)

    // Perform copy to create individual note C
    const newIndividualId = randomUUID()
    await db.insert(notes).values({
      id: newIndividualId,
      userId: userId,
      copiedFromId: orgNoteId,
      type: 'individual',
      title: 'Individual Note C',
      content: '{}',
      createdAt: Date.now(),
      updatedAt: Date.now()
    })

    // Copying again should be blocked because child copy C exists in personal workspace
    allowed = await canCopyToPersonal(orgNoteId, userId)
    expect(allowed).toBe(false)
  })
})
