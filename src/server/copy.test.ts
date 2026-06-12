import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../lib/db'
import { notes, users, teams } from '../../drizzle/schema'
import { eq, and } from 'drizzle-orm'
import { ulid } from 'ulid'

describe('Copy Note Two-Way Duplicate Verification', () => {
  let userId: string
  let teamId: string
  let adminId: string

  beforeEach(async () => {
    // Clean up notes for clean tests
    await db.delete(notes)
    await db.delete(users)
    await db.delete(teams)

    userId = ulid()
    teamId = ulid()
    adminId = ulid()

    // Insert dummy team and users
    await db.insert(teams).values({
      id: teamId,
      name: 'Test Team',
      createdAt: Date.now()
    })

    await db.insert(users).values({
      id: userId,
      username: 'user1',
      passwordHash: 'dummy',
      role: 'viewer',
      teamId: teamId,
      createdAt: Date.now()
    })

    await db.insert(users).values({
      id: adminId,
      username: 'admin',
      passwordHash: 'dummy',
      role: 'admin',
      teamId: teamId,
      createdAt: Date.now()
    })
  })

  it('should handle copying individual notes to team and prevent duplicates', async () => {
    const noteId = ulid()
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

    // Helper to simulate endpoint check for copy-to-team
    async function canCopyToTeam(id: string, userTeamId: string) {
      // Duplicate checks in copy-to-team
      const [existingChild] = await db.select().from(notes).where(
        and(
          eq(notes.copiedFromId, id),
          eq(notes.teamId, userTeamId),
          eq(notes.type, 'team')
        )
      )

      const [note] = await db.select().from(notes).where(eq(notes.id, id))
      let existingParent = null
      if (note?.copiedFromId) {
        const [parent] = await db.select().from(notes).where(
          and(
            eq(notes.id, note.copiedFromId),
            eq(notes.teamId, userTeamId),
            eq(notes.type, 'team')
          )
        )
        existingParent = parent
      }

      return !(existingChild || existingParent)
    }

    // First copy should be allowed
    let allowed = await canCopyToTeam(noteId, teamId)
    expect(allowed).toBe(true)

    // Perform copy
    const teamNoteId = ulid()
    await db.insert(notes).values({
      id: teamNoteId,
      userId: userId,
      teamId: teamId,
      copiedFromId: noteId,
      type: 'team',
      title: 'Team Note B',
      content: '{}',
      createdAt: Date.now(),
      updatedAt: Date.now()
    })

    // Second copy should be blocked because child copy exists in team
    allowed = await canCopyToTeam(noteId, teamId)
    expect(allowed).toBe(false)

    // Delete the team note copy
    await db.delete(notes).where(eq(notes.id, teamNoteId))

    // Copy should be allowed again because copy no longer exists in team
    allowed = await canCopyToTeam(noteId, teamId)
    expect(allowed).toBe(true)
  })

  it('should handle copying team notes back to personal workspace and prevent duplicates', async () => {
    const teamNoteId = ulid()
    const originalIndividualId = ulid()

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

    // 2. Create team note B copied from A
    await db.insert(notes).values({
      id: teamNoteId,
      userId: userId,
      teamId: teamId,
      copiedFromId: originalIndividualId,
      type: 'team',
      title: 'Team Note B',
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

    // Try to copy team note B to personal workspace.
    // It should be blocked because the original note A (parent) is still in the personal workspace.
    let allowed = await canCopyToPersonal(teamNoteId, userId)
    expect(allowed).toBe(false)

    // Delete the original individual note A
    await db.delete(notes).where(eq(notes.id, originalIndividualId))

    // Now, copy should be allowed because original individual note A is gone
    allowed = await canCopyToPersonal(teamNoteId, userId)
    expect(allowed).toBe(true)

    // Perform copy to create individual note C
    const newIndividualId = ulid()
    await db.insert(notes).values({
      id: newIndividualId,
      userId: userId,
      copiedFromId: teamNoteId,
      type: 'individual',
      title: 'Individual Note C',
      content: '{}',
      createdAt: Date.now(),
      updatedAt: Date.now()
    })

    // Copying again should be blocked because child copy C exists in personal workspace
    allowed = await canCopyToPersonal(teamNoteId, userId)
    expect(allowed).toBe(false)
  })
})
