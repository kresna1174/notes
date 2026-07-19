import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db } from '../shared/db'
import { sql } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { users, betterAuthSession, betterAuthAccount, betterAuthVerification } from '../../../drizzle/schema'

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
  secret: process.env.BETTER_AUTH_SECRET || 'dev-secret-change-in-production',
  basePath: '/api/auth',
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: users,
      session: betterAuthSession,
      account: betterAuthAccount,
      verification: betterAuthVerification,
    },
  }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      // GitHub users may have no public email — fall back to noreply address so
      // better-auth's email.toLowerCase() call doesn't crash with a null email
      mapProfileToUser: (profile: any) => ({
        email: profile.email ?? `${profile.id}+${profile.login}@users.noreply.github.com`,
        name: profile.name || profile.login,
        image: profile.avatar_url ?? null,
      }),
    },
  },
  user: {
    additionalFields: {
      username: {
        type: 'string',
        required: false,
        input: false,
      },
      status: {
        type: 'string',
        required: false,
        input: false,
        defaultValue: 'approved',
      },
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ['google', 'github'],
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Set status=approved and generate username from email for OAuth users
        before: (async (user: any) => {
          const emailName = (user.email ?? '').split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_')
          const base = emailName || 'user'
          const username = `${base}_${randomUUID().slice(0, 6)}`
          return {
            data: {
              ...user,
              username,
              status: 'approved',
              createdAt: Date.now(),
            },
          }
        }) as any,
      },
    },
    session: {
      create: {
        // Bridge: insert into custom sessions table so authMiddleware works for OAuth users
        after: async (session) => {
          const userResult = await db.execute(
            sql`SELECT username, role FROM users WHERE id = ${session.userId}`
          )
          const u = userResult.rows[0] as { username: string; role: string } | undefined
          if (!u) return
          await db.execute(sql`
            INSERT INTO sessions (token, user_id, username, role, created_at)
            VALUES (${session.token}, ${session.userId}, ${u.username}, ${u.role}, ${Date.now()})
            ON CONFLICT (token) DO NOTHING
          `)
        },
      },
      delete: {
        // Remove mirrored token from custom sessions table on sign-out
        after: async (session) => {
          await db.execute(sql`DELETE FROM sessions WHERE token = ${session.token}`)
        },
      },
    },
  },
  trustedOrigins: [process.env.BETTER_AUTH_URL || 'http://localhost:3000'],
})
