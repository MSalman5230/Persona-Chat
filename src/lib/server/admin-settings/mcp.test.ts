import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	createMcpServer: vi.fn(),
	deleteMcpServer: vi.fn(),
	getMcpServer: vi.fn(),
	listMcpServers: vi.fn(),
	updateMcpServer: vi.fn(),
	testMcpServer: vi.fn()
}));

vi.mock('$lib/server/mcp/adapter', () => ({
	testMcpServer: mocks.testMcpServer
}));

vi.mock('$lib/server/repositories/mcp', () => ({
	createMcpServer: mocks.createMcpServer,
	deleteMcpServer: mocks.deleteMcpServer,
	getMcpServer: mocks.getMcpServer,
	listMcpServers: mocks.listMcpServers,
	updateMcpServer: mocks.updateMcpServer
}));

import { syncAdminMcpJson, testAdminMcpServer } from './mcp';

describe('admin MCP settings use cases', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.listMcpServers.mockResolvedValue([
			{
				id: '00000000-0000-0000-0000-000000000001',
				name: 'Svelte',
				slug: 'svelte',
				enabled: true
			},
			{
				id: '00000000-0000-0000-0000-000000000002',
				name: 'Memory',
				slug: 'memory',
				enabled: true
			}
		]);
	});

	it('syncs MCP JSON and deletes saved servers omitted from the submitted JSON', async () => {
		await expect(
			syncAdminMcpJson(
				JSON.stringify({
					mcpServers: {
						svelte: { command: 'pnpm', args: ['dlx', '@sveltejs/mcp'] },
						remote: { url: 'https://mcp.example.test/mcp' }
					}
				})
			)
		).resolves.toBe('Saved 2 MCP servers, deleted 1 MCP server');

		expect(mocks.updateMcpServer).toHaveBeenCalledWith(
			'00000000-0000-0000-0000-000000000001',
			expect.objectContaining({
				name: 'Svelte',
				slug: 'svelte',
				command: 'pnpm',
				args: ['dlx', '@sveltejs/mcp']
			})
		);
		expect(mocks.createMcpServer).toHaveBeenCalledWith(
			expect.objectContaining({
				name: 'remote',
				slug: 'remote',
				url: 'https://mcp.example.test/mcp'
			})
		);
		expect(mocks.deleteMcpServer).toHaveBeenCalledWith(
			'00000000-0000-0000-0000-000000000002'
		);
	});

	it('does not mutate MCP servers when submitted JSON is invalid', async () => {
		await expect(syncAdminMcpJson('{"mcpServers":')).rejects.toThrow(/Invalid MCP JSON/);

		expect(mocks.listMcpServers).not.toHaveBeenCalled();
		expect(mocks.updateMcpServer).not.toHaveBeenCalled();
		expect(mocks.createMcpServer).not.toHaveBeenCalled();
		expect(mocks.deleteMcpServer).not.toHaveBeenCalled();
	});

	it('returns the MCP server test message', async () => {
		mocks.getMcpServer.mockResolvedValue({ id: 'mcp-1', name: 'Svelte' });
		mocks.testMcpServer.mockResolvedValue([{ name: 'list-components' }, { name: 'get-docs' }]);

		await expect(testAdminMcpServer('mcp-1')).resolves.toBe('Svelte returned 2 tool(s)');
		expect(mocks.testMcpServer).toHaveBeenCalledWith({ id: 'mcp-1', name: 'Svelte' });
	});

	it('rejects MCP server tests without an id', async () => {
		await expect(testAdminMcpServer('')).rejects.toThrow('MCP server ID is required');
		expect(mocks.getMcpServer).not.toHaveBeenCalled();
	});

	it('rejects MCP server tests for missing servers', async () => {
		mocks.getMcpServer.mockResolvedValue(undefined);

		await expect(testAdminMcpServer('missing-mcp')).rejects.toThrow('MCP server not found');
		expect(mocks.testMcpServer).not.toHaveBeenCalled();
	});
});
