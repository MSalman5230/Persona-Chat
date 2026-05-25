import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

const mocks = vi.hoisted(() => ({
	createMcpServer: vi.fn(),
	listMcpServers: vi.fn()
}));

vi.mock('$lib/server/repositories/mcp', () => ({
	createMcpServer: mocks.createMcpServer,
	listMcpServers: mocks.listMcpServers
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

describe('MCP server API access policy', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.listMcpServers.mockResolvedValue([{ id: 'mcp-1', slug: 'svelte' }]);
	});

	it('lists all management MCP servers for admins', async () => {
		const response = await GET(eventFor({ userId: 'admin-1', isAdmin: true }) as never);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			servers: [{ id: 'mcp-1', slug: 'svelte' }]
		});
		expect(mocks.listMcpServers).toHaveBeenCalledWith({ enabledOnly: false });
	});

	it('lists only enabled management MCP servers for non-admins', async () => {
		await GET(eventFor({ userId: 'user-1', isAdmin: false }) as never);

		expect(mocks.listMcpServers).toHaveBeenCalledWith({ enabledOnly: true });
	});

	it('requires authentication instead of relying only on the global hook', async () => {
		await expect(GET(eventFor({ isAdmin: false }) as never)).rejects.toMatchObject({
			status: 401
		});
		expect(mocks.listMcpServers).not.toHaveBeenCalled();
	});
});
