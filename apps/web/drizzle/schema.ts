import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core'

export const organizations = sqliteTable('organizations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: integer('created_at').notNull(),
})

export const userOrganizations = sqliteTable('user_organizations', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
}, (table) => [
  primaryKey({ columns: [table.userId, table.organizationId] })
])

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'viewer'] }).notNull().default('viewer'),
  status: text('status').notNull().default('approved'),
  createdAt: integer('created_at').notNull(),
})

export const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().default(''),
  title: text('title').notNull().default(''),
  content: text('content').notNull().default('{"type":"doc","content":[]}'),
  type: text('type', { enum: ['individual', 'organization'] }).notNull().default('individual'),
  organizationId: text('organization_id'),
  copiedFromId: text('copied_from_id'),
  pinHash: text('pin_hash'),
  shareToken: text('share_token'),
  sharePinHash: text('share_pin_hash'),
  updatedByUserId: text('updated_by_user_id'),
  coverImage: text('cover_image'),
  icon: text('icon'),
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

export const noteHistory = sqliteTable('note_history', {
  id: text('id').primaryKey(),
  noteId: text('note_id').notNull().references(() => notes.id, { onDelete: 'cascade' }),
  title: text('title').notNull().default(''),
  content: text('content').notNull().default(''),
  coverImage: text('cover_image'),
  icon: text('icon'),
  createdById: text('created_by_id'),
  createdAt: integer('created_at').notNull(),
  versionName: text('version_name'),
})

