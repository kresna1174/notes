import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from '../../../drizzle/schema'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import { sql } from 'drizzle-orm'

declare global {
  // eslint-disable-next-line no-var
  var __notesDbPool: Pool | undefined
}

if (!globalThis.__notesDbPool) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  globalThis.__notesDbPool = pool
}

export const db = drizzle(globalThis.__notesDbPool!, { schema })

export async function initDb() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      created_at BIGINT NOT NULL
    )
  `)

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      status TEXT NOT NULL DEFAULT 'approved',
      created_at BIGINT NOT NULL
    )
  `)

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_organizations (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, organization_id)
    )
  `)

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      parent_id TEXT REFERENCES notes(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '{"type":"doc","content":[]}',
      type TEXT NOT NULL DEFAULT 'individual',
      organization_id TEXT,
      copied_from_id TEXT,
      pin_hash TEXT,
      share_token TEXT,
      share_pin_hash TEXT,
      updated_by_user_id TEXT,
      cover_image TEXT,
      icon TEXT,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    )
  `)

  await db.execute(sql`
    ALTER TABLE notes ADD COLUMN IF NOT EXISTS parent_id TEXT REFERENCES notes(id) ON DELETE CASCADE;
  `)

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      stored_as TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size BIGINT NOT NULL,
      created_at BIGINT NOT NULL
    )
  `)

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at BIGINT NOT NULL
    )
  `)

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS note_history (
      id TEXT PRIMARY KEY,
      note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      cover_image TEXT,
      icon TEXT,
      created_by_id TEXT,
      created_at BIGINT NOT NULL,
      version_name TEXT
    )
  `)

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT 'New Chat',
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    )
  `)

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at BIGINT NOT NULL
    )
  `)

  // Seed default admin
  const result = await db.execute(sql`SELECT COUNT(*) as c FROM users`)
  const count = Number((result.rows[0] as { c: string }).c)
  if (count === 0) {
    const hash = bcrypt.hashSync('admin123', 10)
    await db.execute(sql`
      INSERT INTO users (id, username, password_hash, role, created_at)
      VALUES (${randomUUID()}, 'admin', ${hash}, 'admin', ${Date.now()})
    `)
  }
}
