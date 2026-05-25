import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	createMcpServer: vi.fn(),
	deleteMcpServer: vi.fn(),
	getMcpServer: vi.fn(),
	listMcpServers: vi.fn(),
	syncMcpJsonConfig: vi.fn(),
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
	syncMcpJsonConfig: mocks.syncMcpJsonConfig,
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

import { actions, load } from './+page.server';

const supportedProviders = [{ providerId: 'openai', name: 'OpenAI', models: [] }];

function mcpServer(overrides: Record<string, unknown> = {}) {
	return {
		id: '00000000-0000-0000-0000-000000000001',
		name: 'Svelte',
		slug: 'svelte',
		transport: 'stdio',
		command: 'pnpm',
		args: ['dlx', '@sveltejs/mcp'],
		cwd: null,
		url: null,
		enabled: true,
		status: 'unknown',
		lastError: null,
		lastCheckedAt: null,
		createdAt: new Date('2026-05-25T00:00:00.000Z'),
		updatedAt: new Date('2026-05-25T00:00:00.000Z'),
		hasEnvSecrets: false,
		hasHeaderSecrets: false,
		...overrides
	};
}

function providerConnection(overrides: Record<string, unknown> = {}) {
	return {
		provider: {
			id: 'provider-1',
			name: 'OpenAI',
			providerId: 'openai',
			defaultModel: 'gpt-5',
			isDefault: true
		},
		preference: null,
		effective: {
			defaultModel: 'gpt-5',
			favoriteModels: ['gpt-5'],
			isDefault: true
		},
		...overrides
	};
}

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

function loadEvent(isAdmin: boolean) {
	return {
		locals: {
			user: { id: isAdmin ? 'admin-1' : 'user-1', role: isAdmin ? 'admin' : 'user' },
			session: { id: 'session-1' },
			isAdmin
		}
	};
}

describe('settings page load', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getSupportedProviders.mockReturnValue(supportedProviders);
		mocks.listMcpServers.mockResolvedValue([mcpServer()]);
		mocks.listProviderConnections.mockResolvedValue([providerConnection()]);
	});

	it('loads all management resources for admins', async () => {
		const result = await load(loadEvent(true) as never);

		expect(mocks.listMcpServers).toHaveBeenCalledWith({ enabledOnly: false });
		expect(mocks.listProviderConnections).toHaveBeenCalledWith({
			userId: 'admin-1',
			enabledOnly: false
		});
		expect(result).toMatchObject({
			isAdmin: true,
			mcpServers: [expect.objectContaining({ slug: 'svelte' })],
			providers: [expect.objectContaining({ provider: expect.objectContaining({ id: 'provider-1' }) })],
			mcpJson: expect.stringContaining('"svelte"'),
			loadError: null
		});
	});

	it('loads only enabled management resources for non-admins and hides MCP JSON', async () => {
		const result = await load(loadEvent(false) as never);

		expect(mocks.listMcpServers).toHaveBeenCalledWith({ enabledOnly: true });
		expect(mocks.listProviderConnections).toHaveBeenCalledWith({
			userId: 'user-1',
			enabledOnly: true
		});
		expect(result).toMatchObject({
			isAdmin: false,
			mcpJson: '',
			loadError: null
		});
	});

	it('keeps MCP JSON hidden for non-admins when loading fails', async () => {
		mocks.listMcpServers.mockRejectedValueOnce(new Error('Database is sleeping'));

		const result = await load(loadEvent(false) as never);

		expect(result).toMatchObject({
			isAdmin: false,
			providers: [],
			mcpServers: [],
			mcpJson: '',
			loadError: 'Database is sleeping'
		});
	});
});

describe('settings page actions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.syncMcpJsonConfig.mockResolvedValue({ upsertCount: 2, deleteCount: 1 });
	});

	it('delegates valid MCP JSON to the repository sync helper', async () => {
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
		expect(mocks.syncMcpJsonConfig).toHaveBeenCalledWith(
			expect.objectContaining({
				servers: [
					expect.objectContaining({ slug: 'svelte' }),
					expect.objectContaining({ slug: 'remote' })
				]
			})
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
		expect(mocks.syncMcpJsonConfig).not.toHaveBeenCalled();
		expect(mocks.updateMcpServer).not.toHaveBeenCalled();
		expect(mocks.createMcpServer).not.toHaveBeenCalled();
		expect(mocks.deleteMcpServer).not.toHaveBeenCalled();
	});
});
