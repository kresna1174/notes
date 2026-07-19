import { pgTable, text, bigint, boolean, timestamp, primaryKey, unique } from 'drizzle-orm/pg-core'

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
  email: text('email').unique(),
  passwordHash: text('password_hash'),  // nullable — NULL for OAuth-only users
  role: text('role').notNull().default('viewer'),
  status: text('status').notNull().default('approved'),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  // better-auth required fields
  name: text('name'),
  emailVerified: boolean('email_verified').default(false),
  image: text('image'),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
})

// better-auth internal session table (separate from our custom sessions table)
export const betterAuthSession = pgTable('better_auth_session', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// better-auth internal account table
export const betterAuthAccount = pgTable('better_auth_account', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique().on(table.providerId, table.accountId),
])

// better-auth verification table (OAuth state, PKCE, etc.)
export const betterAuthVerification = pgTable('better_auth_verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export const oauthAccounts = pgTable('oauth_accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  expiresAt: bigint('expires_at', { mode: 'number' }),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
}, (table) => [
  unique().on(table.provider, table.providerAccountId),
])

export const notes = pgTable('notes', {
  id: text('id').primaryKey(),
  parentId: text('parent_id').references(() => notes.id, { onDelete: 'cascade' }),
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
  noteId: text('note_id').references(() => notes.id, { onDelete: 'set null' }),
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

export const chatSessions = pgTable('chat_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull().default('New Chat'),
  type: text('type').notNull().default('rag'),
  noteId: text('note_id').references(() => notes.id, { onDelete: 'set null' }),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
})

export const chatMessages = pgTable('chat_messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => chatSessions.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // 'user' or 'assistant'
  content: text('content').notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
})
