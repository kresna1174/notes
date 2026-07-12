import { pgTable, text, bigint, primaryKey } from 'drizzle-orm/pg-core'

export const organizations = pgTable('organizations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
})

export const userOrganizations = pgTable('user_organizations', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
}, (table) => [
  primaryKey({ columns: [table.userId, table.organizationId] })
])

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('viewer'),
  status: text('status').notNull().default('approved'),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
})

export const notes = pgTable('notes', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().default(''),
  title: text('title').notNull().default(''),
  content: text('content').notNull().default('{"type":"doc","content":[]}'),
  type: text('type').notNull().default('individual'),
  organizationId: text('organization_id'),
  copiedFromId: text('copied_from_id'),
  pinHash: text('pin_hash'),
  shareToken: text('share_token'),
  sharePinHash: text('share_pin_hash'),
  updatedByUserId: text('updated_by_user_id'),
  coverImage: text('cover_image'),
  icon: text('icon'),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
})

export const attachments = pgTable('attachments', {
  id: text('id').primaryKey(),
  noteId: text('note_id').notNull().references(() => notes.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  storedAs: text('stored_as').notNull(),
  mimeType: text('mime_type').notNull(),
  size: bigint('size', { mode: 'number' }).notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
})

export const noteHistory = pgTable('note_history', {
  id: text('id').primaryKey(),
  noteId: text('note_id').notNull().references(() => notes.id, { onDelete: 'cascade' }),
  title: text('title').notNull().default(''),
  content: text('content').notNull().default(''),
  coverImage: text('cover_image'),
  icon: text('icon'),
  createdById: text('created_by_id'),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  versionName: text('version_name'),
})
