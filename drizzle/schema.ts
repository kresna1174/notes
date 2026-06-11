import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  title: text('title').notNull().default(''),
  content: text('content').notNull().default('{}'),
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
