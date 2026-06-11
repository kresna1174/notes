import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../drizzle/schema'
import { mkdirSync } from 'fs'

mkdirSync('./data', { recursive: true })
mkdirSync('./uploads', { recursive: true })

const sqlite = new Database('./data/notes.db')
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

export const db = drizzle(sqlite, { schema })
export { sqlite }
