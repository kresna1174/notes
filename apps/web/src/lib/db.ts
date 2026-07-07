import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../drizzle/schema'
import { mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'

declare global {
  // eslint-disable-next-line no-var
  var __notesSqlite: InstanceType<typeof Database> | undefined
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '../..')

if (!globalThis.__notesSqlite) {
  mkdirSync(join(ROOT, 'data'), { recursive: true })
  mkdirSync(join(ROOT, 'uploads'), { recursive: true })

  const isTest = process.env.NODE_ENV === 'test'
  const dbFile = isTest ? join(ROOT, 'data/notes_test.db') : join(ROOT, 'data/notes.db')
  const _sqlite = new Database(dbFile)
  _sqlite.pragma('journal_mode = WAL')
  _sqlite.pragma('foreign_keys = ON')

  _sqlite.exec(`CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT DEFAULT '' NOT NULL,
    content TEXT DEFAULT '{}' NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`)

  _sqlite.exec(`CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY NOT NULL,
    note_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    stored_as TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (note_id) REFERENCES notes(id) ON UPDATE NO ACTION ON DELETE CASCADE
  )`)

  _sqlite.exec(`CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at INTEGER NOT NULL
  )`)

  _sqlite.exec(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer',
    team_id TEXT,
    created_at INTEGER NOT NULL
  )`)

  _sqlite.exec(`CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`)

  // seed default admin
  const count = (_sqlite.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c
  if (count === 0) {
    const hash = bcrypt.hashSync('admin123', 10)
    _sqlite.prepare('INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(randomUUID(), 'admin', hash, 'admin', Date.now())
  }

  globalThis.__notesSqlite = _sqlite
}

export const sqlite = globalThis.__notesSqlite!

// run migrations every time (idempotent)
const notesCols = (sqlite.pragma('table_info(notes)') as { name: string }[]).map(c => c.name)
if (!notesCols.includes('user_id')) {
  sqlite.exec(`ALTER TABLE notes ADD COLUMN user_id TEXT NOT NULL DEFAULT ''`)
}
if (!notesCols.includes('pin_hash')) {
  sqlite.exec(`ALTER TABLE notes ADD COLUMN pin_hash TEXT`)
}
if (!notesCols.includes('share_token')) {
  sqlite.exec(`ALTER TABLE notes ADD COLUMN share_token TEXT`)
}
if (!notesCols.includes('share_pin_hash')) {
  sqlite.exec(`ALTER TABLE notes ADD COLUMN share_pin_hash TEXT`)
}
if (!notesCols.includes('updated_by_user_id')) {
  sqlite.exec(`ALTER TABLE notes ADD COLUMN updated_by_user_id TEXT`)
}
if (!notesCols.includes('team_id')) {
  sqlite.exec(`ALTER TABLE notes ADD COLUMN team_id TEXT`)
}
if (!notesCols.includes('type')) {
  sqlite.exec(`ALTER TABLE notes ADD COLUMN type TEXT NOT NULL DEFAULT 'individual'`)
  sqlite.exec(`UPDATE notes SET type = 'team' WHERE team_id IS NOT NULL AND team_id != ''`)
}
if (!notesCols.includes('copied_from_id')) {
  sqlite.exec(`ALTER TABLE notes ADD COLUMN copied_from_id TEXT`)
}
if (!notesCols.includes('cover_image')) {
  sqlite.exec(`ALTER TABLE notes ADD COLUMN cover_image TEXT`)
}
if (!notesCols.includes('icon')) {
  sqlite.exec(`ALTER TABLE notes ADD COLUMN icon TEXT`)
}

const usersCols = (sqlite.pragma('table_info(users)') as { name: string }[]).map(c => c.name)
if (!usersCols.includes('team_id')) {
  sqlite.exec(`ALTER TABLE users ADD COLUMN team_id TEXT`)
}
if (!usersCols.includes('status')) {
  sqlite.exec(`ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'`)
}

export const db = drizzle(sqlite, { schema })
