import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	createMcpServer: vi.fn(),
	deleteMcpServer: vi.fn(),
	getMcpServer: vi.fn(),
	listMcpServers: vi.fn(),
	updateMcpServer: vi.fn(),
	createProviderConnection: vi.fn(),
	deleteProviderConnection: vi.fn(),
	getProviderConnection: vi.fn(),
	listProviderConnections: vi.fn(),
	saveUserProviderPreference: vi.fn(),
	updateProviderConnection: vi.fn(),
	createProviderRuntime: vi.fn(),
	getSupportedProviders: vi.fn(),
	providerPayloadFromForm: vi.fn(),
	testMcpServer: vi.fn()
}));

vi.mock('$lib/server/mcp/adapter', () => ({
	testMcpServer: mocks.testMcpServer
}));

vi.mock('$lib/server/providers/catalog', () => ({
	getSupportedProviders: mocks.getSupportedProviders
}));

vi.mock('$lib/server/providers/runtime', () => ({
	createProviderRuntime: mocks.createProviderRuntime
}));

vi.mock('$lib/server/providers/settings-form', () => ({
	providerPayloadFromForm: mocks.providerPayloadFromForm
}));

vi.mock('$lib/server/repositories/mcp', () => ({
	createMcpServer: mocks.createMcpServer,
	deleteMcpServer: mocks.deleteMcpServer,
	getMcpServer: mocks.getMcpServer,
	listMcpServers: mocks.listMcpServers,
	updateMcpServer: mocks.updateMcpServer
}));

vi.mock('$lib/server/repositories/providers', () => ({
	createProviderConnection: mocks.createProviderConnection,
	deleteProviderConnection: mocks.deleteProviderConnection,
	getProviderConnection: mocks.getProviderConnection,
	listProviderConnections: mocks.listProviderConnections,
	saveUserProviderPreference: mocks.saveUserProviderPreference,
	updateProviderConnection: mocks.updateProviderConnection
}));

import { actions } from './+page.server';

function formRequest(values: Record<string, string>) {
	const form = new FormData();
	for (const [key, value] of Object.entries(values)) {
		form.set(key, value);
	}
	return new Request('http://localhost/settings', {
		method: 'POST',
		body: form
	});
}

function adminEvent(request: Request) {
	return {
		request,
		locals: {
			user: { id: 'admin-1', role: 'admin' },
			session: { id: 'session-1' },
			isAdmin: true
		}
	};
}

describe('settings page actions', () => {
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
		const result = await actions.saveMcpJson(
			adminEvent(
				formRequest({
				mcpJson: JSON.stringify({
					mcpServers: {
						svelte: { command: 'pnpm', args: ['dlx', '@sveltejs/mcp'] },
						remote: { url: 'https://mcp.example.test/mcp' }
					}
				})
			})
			) as never
		);

		expect(result).toMatchObject({ ok: true, message: 'Saved 2 MCP servers, deleted 1 MCP server' });
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
		const result = await actions.saveMcpJson(
			adminEvent(formRequest({ mcpJson: '{"mcpServers":' })) as never
		);

		expect(result).toMatchObject({
			status: 400,
			data: {
				error: expect.stringMatching(/Invalid MCP JSON/),
				mcpJson: '{"mcpServers":'
			}
		});
		expect(mocks.listMcpServers).not.toHaveBeenCalled();
		expect(mocks.updateMcpServer).not.toHaveBeenCalled();
		expect(mocks.createMcpServer).not.toHaveBeenCalled();
		expect(mocks.deleteMcpServer).not.toHaveBeenCalled();
	});
});
