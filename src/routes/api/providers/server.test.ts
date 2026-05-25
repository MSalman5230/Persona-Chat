import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

const mocks = vi.hoisted(() => ({
	createProviderConnection: vi.fn(),
	findSupportedProvider: vi.fn(),
	listProviderConnections: vi.fn(),
	serializeProviderConnectionForUser: vi.fn()
}));

vi.mock('$lib/server/providers/catalog', () => ({
	findSupportedProvider: mocks.findSupportedProvider
}));

vi.mock('$lib/server/repositories/providers', () => ({
	createProviderConnection: mocks.createProviderConnection,
	listProviderConnections: mocks.listProviderConnections,
	providerInputSchema: { parse: (value: unknown) => value },
	serializeProviderConnectionForUser: mocks.serializeProviderConnectionForUser
}));

import { GET } from './+server';

function eventFor(input: { userId?: string; isAdmin: boolean }) {
	return {
		locals: {
			user: input.userId ? { id: input.userId, role: input.isAdmin ? 'admin' : 'user' } : null,
			session: input.userId ? { id: 'session-1' } : null,
			isAdmin: input.isAdmin
		}
	} as RequestEvent;
}

describe('provider API access policy', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.listProviderConnections.mockResolvedValue([{ provider: { id: 'provider-1' } }]);
	});

	it('lists all management providers for admins', async () => {
		const response = await GET(eventFor({ userId: 'admin-1', isAdmin: true }) as never);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			providers: [{ provider: { id: 'provider-1' } }]
		});
		expect(mocks.listProviderConnections).toHaveBeenCalledWith({
			userId: 'admin-1',
			enabledOnly: false
		});
	});

	it('lists only enabled management providers for non-admins', async () => {
		await GET(eventFor({ userId: 'user-1', isAdmin: false }) as never);

		expect(mocks.listProviderConnections).toHaveBeenCalledWith({
			userId: 'user-1',
			enabledOnly: true
		});
	});

	it('requires authentication instead of relying only on the global hook', async () => {
		await expect(GET(eventFor({ isAdmin: false }) as never)).rejects.toMatchObject({
			status: 401
		});
		expect(mocks.listProviderConnections).not.toHaveBeenCalled();
	});
});
