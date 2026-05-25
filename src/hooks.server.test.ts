import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getSession: vi.fn(),
	hasAdminAccess: vi.fn(),
	isAuthPath: vi.fn(),
	redirectToLogin: vi.fn(),
	svelteKitHandler: vi.fn()
}));

vi.mock('$app/environment', () => ({
	building: false
}));

vi.mock('$lib/server/auth', () => ({
	auth: {
		api: {
			getSession: mocks.getSession
		},
		options: {}
	}
}));

vi.mock('$lib/server/auth/guards', () => ({
	hasAdminAccess: mocks.hasAdminAccess,
	redirectToLogin: mocks.redirectToLogin
}));

vi.mock('better-auth/svelte-kit', () => ({
	isAuthPath: mocks.isAuthPath,
	svelteKitHandler: mocks.svelteKitHandler
}));

import { handle } from './hooks.server';

function currentSession(userId = 'user-1') {
	return {
		session: {
			id: 'session-1',
			userId,
			token: 'token',
			expiresAt: new Date('2099-01-01T00:00:00.000Z'),
			createdAt: new Date('2026-01-01T00:00:00.000Z'),
			updatedAt: new Date('2026-01-01T00:00:00.000Z')
		},
		user: {
			id: userId,
			name: 'Admin User',
			email: 'admin@example.test',
			emailVerified: true,
			createdAt: new Date('2026-01-01T00:00:00.000Z'),
			updatedAt: new Date('2026-01-01T00:00:00.000Z')
		}
	};
}

async function runHandle(path: string) {
	const request = new Request(`http://localhost${path}`);
	const event = {
		locals: {} as App.Locals,
		request,
		url: new URL(request.url)
	};
	const resolve = vi.fn(async () => new Response('ok'));
	const response = await handle({ event, resolve } as never);
	return { event, resolve, response };
}

describe('server hook admin authorization', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getSession.mockResolvedValue(null);
		mocks.hasAdminAccess.mockResolvedValue(false);
		mocks.isAuthPath.mockReturnValue(false);
		mocks.redirectToLogin.mockImplementation((pathname: string, search = ''): never => {
			throw Object.assign(new Error('redirect'), {
				location: `/login?redirectTo=${encodeURIComponent(`${pathname}${search}`)}`,
				status: 303
			});
		});
		mocks.svelteKitHandler.mockImplementation(
			({
				event,
				resolve
			}: {
				event: unknown;
				resolve: (event: unknown) => Promise<Response> | Response;
			}) => resolve(event)
		);
	});

	it('redirects unauthenticated admin page requests to login', async () => {
		await expect(runHandle('/admin-settings')).rejects.toMatchObject({
			location: '/login?redirectTo=%2Fadmin-settings',
			status: 303
		});
		expect(mocks.redirectToLogin).toHaveBeenCalledWith('/admin-settings', '');
		expect(mocks.hasAdminAccess).not.toHaveBeenCalled();
	});

	it('returns JSON 401 for unauthenticated admin API requests', async () => {
		const { response } = await runHandle('/api/providers');

		expect(response.status).toBe(401);
		await expect(response.json()).resolves.toEqual({ message: 'Authentication required' });
		expect(mocks.hasAdminAccess).not.toHaveBeenCalled();
	});

	it('redirects authenticated non-admin admin page requests home', async () => {
		mocks.getSession.mockResolvedValue(currentSession());

		const { response } = await runHandle('/admin-settings');

		expect(response.status).toBe(303);
		expect(response.headers.get('location')).toBe('http://localhost/');
		expect(mocks.hasAdminAccess).toHaveBeenCalledWith('user-1');
	});

	it('returns JSON 403 for authenticated non-admin admin API requests', async () => {
		mocks.getSession.mockResolvedValue(currentSession());

		const { response } = await runHandle('/api/providers');

		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toEqual({ message: 'Admin access required' });
		expect(mocks.hasAdminAccess).toHaveBeenCalledWith('user-1');
	});

	it('sets locals.isAdmin for authenticated admin page requests', async () => {
		mocks.getSession.mockResolvedValue(currentSession());
		mocks.hasAdminAccess.mockResolvedValue(true);

		const { event, response } = await runHandle('/settings');

		expect(response.status).toBe(200);
		expect(event.locals.isAdmin).toBe(true);
	});

	it('checks Better Auth permissions once for an admin page request', async () => {
		mocks.getSession.mockResolvedValue(currentSession());
		mocks.hasAdminAccess.mockResolvedValue(true);

		const { response } = await runHandle('/admin-settings');

		expect(response.status).toBe(200);
		expect(mocks.hasAdminAccess).toHaveBeenCalledTimes(1);
		expect(mocks.hasAdminAccess).toHaveBeenCalledWith('user-1');
	});
});
