import { describe, expect, it, vi } from 'vitest';

type FakeDbOptions = {
	firstUserId?: string;
	userCount?: number;
};

function fakeDb(options: FakeDbOptions = {}) {
	const state = {
		updateSet: undefined as Record<string, unknown> | undefined
	};

	const db = {
		select: vi.fn((selection?: Record<string, unknown>) => {
			if (selection && 'value' in selection) {
				return {
					from: vi.fn(async () => [{ value: options.userCount ?? 1 }])
				};
			}

			return {
				from: vi.fn(() => ({
					orderBy: vi.fn(() => ({
						limit: vi.fn(async () => [{ id: options.firstUserId ?? 'user-1' }])
					}))
				}))
			};
		}),
		update: vi.fn(() => ({
			set: vi.fn((patch: Record<string, unknown>) => {
				state.updateSet = patch;
				return {
					where: vi.fn(async () => undefined)
				};
			})
		}))
	};

	return { db, state };
}

async function importAuth(env: Record<string, string | undefined>, options: FakeDbOptions = {}) {
	vi.resetModules();
	const captured: { options?: Record<string, unknown> } = {};
	const database = fakeDb(options);

	vi.doMock('$env/dynamic/private', () => ({ env }));
	vi.doMock('$app/server', () => ({ getRequestEvent: vi.fn() }));
	vi.doMock('$lib/server/db', () => ({ db: database.db }));
	vi.doMock('@better-auth/drizzle-adapter', () => ({
		drizzleAdapter: vi.fn(() => 'drizzle-adapter')
	}));
	vi.doMock('better-auth/plugins', () => ({
		admin: vi.fn(() => 'admin-plugin')
	}));
	vi.doMock('better-auth/svelte-kit', () => ({
		sveltekitCookies: vi.fn(() => 'sveltekit-cookies-plugin')
	}));
	vi.doMock('better-auth', () => ({
		betterAuth: vi.fn((authOptions) => {
			captured.options = authOptions;
			return {
				api: { userHasPermission: vi.fn() },
				options: authOptions
			};
		})
	}));

	const module = await import('./auth');
	return { module, captured, database };
}

describe('Better Auth configuration', () => {
	it('enables email/password, account linking, optional Google, admin plugin, and SvelteKit cookies', async () => {
		const { captured, module } = await importAuth({
			BETTER_AUTH_SECRET: 'secret',
			BETTER_AUTH_URL: 'http://localhost:5173',
			GOOGLE_CLIENT_ID: 'google-client',
			GOOGLE_CLIENT_SECRET: 'google-secret'
		});

		expect(module.isGoogleAuthConfigured()).toBe(true);
		expect(captured.options).toMatchObject({
			appName: 'Persona',
			baseURL: 'http://localhost:5173',
			emailAndPassword: { enabled: true },
			account: {
				accountLinking: {
					enabled: true,
					requireLocalEmailVerified: false,
					trustedProviders: ['google', 'email-password']
				}
			},
			socialProviders: {
				google: {
					clientId: 'google-client',
					clientSecret: 'google-secret'
				}
			},
			plugins: ['admin-plugin', 'sveltekit-cookies-plugin']
		});
	});

	it('omits Google provider config when required env vars are missing', async () => {
		const { captured, module } = await importAuth({
			BETTER_AUTH_SECRET: 'secret',
			BETTER_AUTH_URL: 'http://localhost:5173',
			GOOGLE_CLIENT_ID: 'google-client'
		});

		expect(module.isGoogleAuthConfigured()).toBe(false);
		expect(captured.options?.socialProviders).toBeUndefined();
	});

	it('promotes the first created user to Better Auth admin role', async () => {
		const { captured, database } = await importAuth(
			{
				BETTER_AUTH_SECRET: 'secret',
				BETTER_AUTH_URL: 'http://localhost:5173'
			},
			{ firstUserId: 'first-user', userCount: 1 }
		);

		const hooks = captured.options?.databaseHooks as {
			user: { create: { after: (user: { id: string }) => Promise<void> } };
		};
		await hooks.user.create.after({ id: 'first-user' });

		expect(database.state.updateSet).toMatchObject({ role: 'admin' });
	});
});
