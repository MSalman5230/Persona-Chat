import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

const mocks = vi.hoisted(() => ({
	getProviderConnection: vi.fn(),
	serializeProviderConnectionForUser: vi.fn()
}));

vi.mock('$lib/server/repositories/providers', () => ({
	getProviderConnection: mocks.getProviderConnection,
	serializeProviderConnectionForUser: mocks.serializeProviderConnectionForUser,
	providerUpdateSchema: { parse: (value: unknown) => value },
	updateProviderConnection: vi.fn(),
	deleteProviderConnection: vi.fn()
}));

import { GET } from './+server';

function eventFor(input: { userId: string; isAdmin: boolean; id: string }) {
	return {
		params: { id: input.id },
		locals: {
			user: { id: input.userId, role: input.isAdmin ? 'admin' : 'user' },
			session: { id: 'session-1' },
			isAdmin: input.isAdmin
		}
	} as RequestEvent;
}

describe('provider by id API', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns the same public provider shape as the list endpoint', async () => {
		const row = { id: 'provider-1', name: 'OpenAI' };
		const publicConnection = {
			provider: { id: 'provider-1', name: 'OpenAI', hasApiKey: true },
			preference: null,
			effective: { defaultModel: 'gpt-5', favoriteModels: [], isDefault: true }
		};
		mocks.getProviderConnection.mockResolvedValue(row);
		mocks.serializeProviderConnectionForUser.mockResolvedValue(publicConnection);

		const response = await GET(
			eventFor({ userId: 'admin-1', isAdmin: true, id: 'provider-1' }) as never
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ provider: publicConnection });
		expect(mocks.serializeProviderConnectionForUser).toHaveBeenCalledWith(row, 'admin-1');
	});

	it('requires admin access', async () => {
		await expect(
			GET(eventFor({ userId: 'user-1', isAdmin: false, id: 'provider-1' }) as never)
		).rejects.toMatchObject({ status: 403 });
		expect(mocks.getProviderConnection).not.toHaveBeenCalled();
	});
});
