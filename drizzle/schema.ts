import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'viewer'] }).notNull().default('viewer'),
  createdAt: integer('created_at').notNull(),
})

export const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().default(''),
  title: text('title').notNull().default(''),
  content: text('content').notNull().default('{"type":"doc","content":[]}'),
  pinHash: text('pin_hash'),
  shareToken: text('share_token'),
  sharePinHash: text('share_pin_hash'),
  updatedByUserId: text('updated_by_user_id'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const attachments = sqliteTable('attachments', {
  id: text('id').primaryKey(),
  noteId: text('note_id').notNull().references(() => notes.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  storedAs: text('stored_as').notNull(),
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(),
  createdAt: integer('created_at').notNull(),
})
