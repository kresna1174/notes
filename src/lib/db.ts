import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../drizzle/schema'
import { mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import bcrypt from 'bcryptjs'
import { ulid } from 'ulid'

declare global {
  // eslint-disable-next-line no-var
  var __notesSqlite: InstanceType<typeof Database> | undefined
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '../..')

if (!globalThis.__notesSqlite) {
  mkdirSync(join(ROOT, 'data'), { recursive: true })
  mkdirSync(join(ROOT, 'uploads'), { recursive: true })

  const _sqlite = new Database(join(ROOT, 'data/notes.db'))
  _sqlite.pragma('journal_mode = WAL')
  _sqlite.pragma('foreign_keys = ON')

  _sqlite.exec(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer',
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
      .run(ulid(), 'admin', hash, 'admin', Date.now())
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

export const db = drizzle(sqlite, { schema })
