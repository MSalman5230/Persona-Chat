import { building, dev } from '$app/environment';
import { getRequestEvent } from '$app/server';
import { env } from '$env/dynamic/private';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins';
import { sveltekitCookies } from 'better-auth/svelte-kit';

import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { isAdminRole, roleForNewUser } from '$lib/server/auth-role';

export { isAdminRole, roleForNewUser };

const localSecret = 'persona-local-development-secret-change-before-production';

function authSecret(): string | undefined {
	return env.BETTER_AUTH_SECRET || (dev || building ? localSecret : undefined);
}

function authBaseUrl(): string | undefined {
	return env.BETTER_AUTH_URL || (dev || building ? 'http://localhost:5173' : undefined);
}

export function googleAuthEnabled(): boolean {
	return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export const auth = betterAuth({
	appName: 'Persona',
	baseURL: authBaseUrl(),
	secret: authSecret(),
	database: drizzleAdapter(db, {
		provider: 'pg',
		schema: {
			...schema,
			user: schema.users,
			session: schema.sessions,
			account: schema.accounts,
			verification: schema.verifications
		}
	}),
	emailAndPassword: {
		enabled: true
	},
	socialProviders: googleAuthEnabled()
		? {
				google: {
					clientId: env.GOOGLE_CLIENT_ID as string,
					clientSecret: env.GOOGLE_CLIENT_SECRET as string
				}
			}
		: {},
	databaseHooks: {
		user: {
			create: {
				before: async (user) => {
					const existingUsers = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
					return {
						data: {
							...user,
							role: roleForNewUser(existingUsers.length),
							banned: false
						}
					};
				}
			}
		}
	},
	plugins: [admin({ defaultRole: 'user', adminRoles: ['admin'] }), sveltekitCookies(getRequestEvent)]
});

export type AuthSessionPayload = Awaited<ReturnType<typeof auth.api.getSession>>;
export type AuthSession = NonNullable<AuthSessionPayload>['session'];
export type AuthUser = NonNullable<AuthSessionPayload>['user'];
