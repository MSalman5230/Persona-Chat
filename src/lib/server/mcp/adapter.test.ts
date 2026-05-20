import { beforeAll, describe, expect, it } from 'vitest';

import type { McpServerRow } from '$lib/server/repositories/mcp';
import type { PublicMcpTool } from './adapter';

beforeAll(() => {
	process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
	process.env.CREDENTIAL_ENCRYPTION_KEY ??= Buffer.alloc(32, 4).toString('base64');
});

function fakeServer(): McpServerRow {
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
		updatedAt: new Date('2026-01-01T00:00:00.000Z')
	};
}

const fakeTool: PublicMcpTool = {
	name: 'mcp_local_box_echo',
	description: 'Echoes input',
	serverId: '00000000-0000-0000-0000-000000000001',
	serverSlug: 'local-box',
	originalName: 'echo',
	inputSchema: {
		type: 'object',
		properties: {
			value: { type: 'string' }
		}
	}
};

describe('MCP adapter', () => {
	it('creates PI tool names from server and tool names', async () => {
		const { mcpToolName } = await import('./adapter');

		expect(mcpToolName('Local Box', 'Read File')).toBe('mcp_local_box_read_file');
	});

	it('wraps MCP tool calls as PI tool definitions', async () => {
		const { createMcpToolDefinition } = await import('./adapter');
		const tool = createMcpToolDefinition(fakeServer(), fakeTool, async (_server, toolName, args) => ({
			content: [{ type: 'text', text: `${toolName}:${args.value}` }]
		}));

		const result = await tool.execute(
			'call-1',
			{ value: 'hello' } as never,
			undefined,
			undefined,
			{} as never
		);

		expect(tool.name).toBe('mcp_local_box_echo');
		expect(result.content).toEqual([{ type: 'text', text: 'echo:hello' }]);
	});
});
