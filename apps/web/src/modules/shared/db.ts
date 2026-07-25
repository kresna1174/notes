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
      type TEXT NOT NULL DEFAULT 'rag',
      note_id TEXT REFERENCES notes(id) ON DELETE SET NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    )
  `)

  // Migrate existing tables
  await db.execute(sql`ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'rag'`).catch(() => {})
  await db.execute(sql`ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS note_id TEXT REFERENCES notes(id) ON DELETE SET NULL`).catch(() => {})

  // Make attachments.note_id nullable (remove NOT NULL constraint if it exists)
  await db.execute(sql`ALTER TABLE attachments ALTER COLUMN note_id DROP NOT NULL`).catch(() => {})

  // Clean up the dummy RAG Global note that was auto-created for old attachment uploads
  await db.execute(sql`DELETE FROM notes WHERE id = '00000000-0000-0000-0000-000000000000'`).catch(() => {})

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at BIGINT NOT NULL
    )
  `)

  // OAuth: add email column to users if not exists
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT UNIQUE`)

  // OAuth: make password_hash nullable (safe to run multiple times)
  await db.execute(sql`ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL`).catch(() => {})

  // better-auth: add required user fields if not exists
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT`)
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE`)
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS image TEXT`)
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`)

  // OAuth: create oauth_accounts table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS oauth_accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      provider_account_id TEXT NOT NULL,
      access_token TEXT,
      refresh_token TEXT,
      expires_at BIGINT,
      created_at BIGINT NOT NULL,
      UNIQUE(provider, provider_account_id)
    )
  `)

  // better-auth session table (separate from custom sessions table)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS better_auth_session (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  // add columns if table was created without them in a prior migration
  await db.execute(sql`ALTER TABLE better_auth_session ADD COLUMN IF NOT EXISTS ip_address TEXT`).catch(() => {})
  await db.execute(sql`ALTER TABLE better_auth_session ADD COLUMN IF NOT EXISTS user_agent TEXT`).catch(() => {})

  // better-auth account table (used internally by better-auth)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS better_auth_account (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      account_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      access_token TEXT,
      refresh_token TEXT,
      id_token TEXT,
      access_token_expires_at TIMESTAMPTZ,
      refresh_token_expires_at TIMESTAMPTZ,
      scope TEXT,
      password TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(provider_id, account_id)
    )
  `)
  // better-auth verification table (OAuth state/PKCE tokens)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS better_auth_verification (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL,
      value TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  // add columns if table was created without them in a prior migration
  await db.execute(sql`ALTER TABLE better_auth_account ADD COLUMN IF NOT EXISTS id_token TEXT`).catch(() => {})
  await db.execute(sql`ALTER TABLE better_auth_account ADD COLUMN IF NOT EXISTS refresh_token_expires_at TIMESTAMPTZ`).catch(() => {})
  await db.execute(sql`ALTER TABLE better_auth_account ADD COLUMN IF NOT EXISTS password TEXT`).catch(() => {})

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ai_skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      content TEXT NOT NULL DEFAULT '',
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    )
  `)

  // ai_skills.slug — stable identifier the AI agent resolves via load_skill(name).
  await db.execute(sql`ALTER TABLE ai_skills ADD COLUMN IF NOT EXISTS slug TEXT`).catch(() => {})
  // Backfill any pre-existing rows: slugify the name, de-duplicating collisions with a
  // row-number suffix so the unique index below can be created without conflicts.
  await db.execute(sql`
    UPDATE ai_skills a SET slug = s.new_slug
    FROM (
      SELECT id,
        CASE WHEN rn = 1 THEN base ELSE base || '-' || rn END AS new_slug
      FROM (
        SELECT id,
          COALESCE(NULLIF(trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')), ''), 'skill') AS base,
          row_number() OVER (
            PARTITION BY COALESCE(NULLIF(trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')), ''), 'skill')
            ORDER BY created_at, id
          ) AS rn
        FROM ai_skills WHERE slug IS NULL
      ) t
    ) s
    WHERE a.id = s.id
  `).catch(() => {})
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS ux_ai_skills_slug ON ai_skills (slug)`).catch(() => {})

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      expires_at BIGINT NOT NULL,
      used_at BIGINT,
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
