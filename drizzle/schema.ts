import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const teams = sqliteTable('teams', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: integer('created_at').notNull(),
})

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'viewer'] }).notNull().default('viewer'),
  teamId: text('team_id'),
  createdAt: integer('created_at').notNull(),
})

export const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().default(''),
  title: text('title').notNull().default(''),
  content: text('content').notNull().default('{"type":"doc","content":[]}'),
  type: text('type', { enum: ['individual', 'team'] }).notNull().default('individual'),
  teamId: text('team_id'),
  copiedFromId: text('copied_from_id'),
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
