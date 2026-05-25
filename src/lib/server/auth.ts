import { getRequestEvent } from '$app/server';
import { env } from '$env/dynamic/private';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { asc, count, eq } from 'drizzle-orm';
import { betterAuth } from 'better-auth';
import { admin } from 'better-auth/plugins';
import { sveltekitCookies } from 'better-auth/svelte-kit';

import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { users } from '$lib/server/db/schema';

const authSchema = {
	...schema,
	user: schema.users,
	session: schema.sessions,
	account: schema.accounts,
	verification: schema.verifications
};

export function isGoogleAuthConfigured(): boolean {
	return Boolean(env.BETTER_AUTH_URL && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

async function promoteFirstUserToBetterAuthAdmin(userId: string): Promise<void> {
	const [total] = await db.select({ value: count() }).from(users);
	if (total?.value === 0) return;

	const [firstUser] = await db
		.select({ id: users.id })
		.from(users)
		.orderBy(asc(users.createdAt), asc(users.id))
		.limit(1);

	if (firstUser?.id !== userId) return;

	await db
		.update(users)
		.set({ role: 'admin', updatedAt: new Date() })
		.where(eq(users.id, userId));
}

const socialProviders = isGoogleAuthConfigured()
	? {
			google: {
				clientId: env.GOOGLE_CLIENT_ID as string,
				clientSecret: env.GOOGLE_CLIENT_SECRET as string
			}
		}
	: undefined;

export const auth = betterAuth({
	appName: 'Persona',
	...(env.BETTER_AUTH_URL ? { baseURL: env.BETTER_AUTH_URL } : {}),
	...(env.BETTER_AUTH_SECRET ? { secret: env.BETTER_AUTH_SECRET } : {}),
	database: drizzleAdapter(db, {
		provider: 'pg',
		schema: authSchema,
		transaction: true
	}),
	emailAndPassword: {
		enabled: true
	},
	...(socialProviders ? { socialProviders } : {}),
	account: {
		accountLinking: {
			enabled: true,
			requireLocalEmailVerified: false,
			trustedProviders: ['google', 'email-password']
		}
	},
	databaseHooks: {
		user: {
			create: {
				after: async (user) => {
					await promoteFirstUserToBetterAuthAdmin(user.id);
				}
			}
		}
	},
	plugins: [admin(), sveltekitCookies(getRequestEvent)]
});
