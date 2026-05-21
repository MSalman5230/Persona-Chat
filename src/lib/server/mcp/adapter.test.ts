import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { McpServerRow } from '$lib/server/repositories/mcp';

beforeAll(() => {
	process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
	process.env.CREDENTIAL_ENCRYPTION_KEY ??= Buffer.alloc(32, 4).toString('base64');
});

function fakeServer(overrides: Partial<McpServerRow> = {}): McpServerRow {
	return {
		id: '00000000-0000-0000-0000-000000000001',
		name: 'Local Box',
		slug: 'local-box',
		transport: 'stdio',
		command: 'node',
		args: [],
		cwd: null,
		url: null,
		secret: null,
		enabled: true,
		status: 'unknown',
		lastError: null,
		lastCheckedAt: null,
		createdAt: new Date('2026-01-01T00:00:00.000Z'),
		updatedAt: new Date('2026-01-01T00:00:00.000Z'),
		...overrides
	};
}

describe('MCP adapter', () => {
	it('creates PI tool names from server and tool names', async () => {
		const { mcpToolName } = await import('./adapter');

		expect(mcpToolName('Local Box', 'Read File')).toBe('mcp_local_box_read_file');
	});

	it('connects to the requested server only and caches listed tools by update time', async () => {
		const { McpClientManager } = await import('./adapter');
		const listTools = vi.fn(async () => ({
			tools: [{ name: 'echo', description: 'Echo', inputSchema: { type: 'object', properties: {} } }]
		}));
		const close = vi.fn(async () => undefined);
		const connectedSlugs: string[] = [];
		const manager = new McpClientManager({
			stdioIdleMs: 10_000,
			clientFactory: async (server) => {
				connectedSlugs.push(server.slug);
				return {
					listTools,
					callTool: vi.fn(),
					close
				} as never;
			}
		});

		const local = fakeServer();
		const other = fakeServer({
			id: '00000000-0000-0000-0000-000000000002',
			name: 'Other Box',
			slug: 'other-box'
		});

		await expect(manager.listTools(local)).resolves.toHaveLength(1);
		await expect(manager.listTools(local)).resolves.toHaveLength(1);

		expect(other.slug).toBe('other-box');
		expect(connectedSlugs).toEqual(['local-box']);
		expect(listTools).toHaveBeenCalledTimes(1);
		await manager.closeAll();
	});

	it('turns MCP isError results into thrown meta-tool errors', async () => {
		const { buildProgressiveMcpToolDefinitions } = await import('./adapter');
		const server = fakeServer();
		const markServerStatus = vi.fn(async () => undefined);
		const manager = {
			callTool: vi.fn(async () => ({
				isError: true,
				content: [{ type: 'text', text: 'tool exploded' }]
			}))
		};
		const tools = buildProgressiveMcpToolDefinitions({
			manager: manager as never,
			getEnabledServerBySlug: async () => server,
			listEnabledServers: async () => [server],
			markServerStatus
		});
		const callTool = tools.find((tool) => tool.name === 'mcp_call_tool');

		await expect(
			callTool?.execute(
				'call-1',
				{ server: 'local-box', name: 'echo', arguments: { value: 'hello' } } as never,
				undefined,
				undefined,
				{} as never
			)
		).rejects.toThrow('tool exploded');
		expect(markServerStatus).toHaveBeenCalledWith(server.id, 'error', 'tool exploded');
	});

	it('uses the legacy SSE transport when configured explicitly', async () => {
		const { createMcpTransport } = await import('./adapter');
		const transport = createMcpTransport(
			fakeServer({
				transport: 'sse',
				command: null,
				url: 'https://mcp.example.test/sse'
			})
		);

		expect(transport.constructor.name).toBe('SSEClientTransport');
	});
});
