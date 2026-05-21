import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import type { McpServerRow } from '$lib/server/repositories/mcp';
import { getMcpSecrets, markMcpServerStatus } from '$lib/server/repositories/mcp';

import { mcpToolName } from './names';
import type {
	McpClientFactory,
	McpClientLike,
	McpToolCallResult,
	McpToolInfo,
	PublicMcpTool
} from './types';

type ManagedClient = {
	client: McpClientLike;
	updatedAtMs: number;
	idleTimer?: ReturnType<typeof setTimeout>;
};

type ToolCacheEntry = {
	updatedAtMs: number;
	tools: PublicMcpTool[];
};

const defaultStdioIdleMs = 60_000;

function serverUpdatedAtMs(server: McpServerRow): number {
	return server.updatedAt instanceof Date
		? server.updatedAt.getTime()
		: new Date(server.updatedAt).getTime();
}

function normalizePublicMcpTools(server: McpServerRow, tools: McpToolInfo[]): PublicMcpTool[] {
	return tools.map((tool) => ({
		name: mcpToolName(server.slug, tool.name),
		description: tool.description ?? `MCP tool ${tool.name} from ${server.name}`,
		serverId: server.id,
		serverSlug: server.slug,
		originalName: tool.name,
		inputSchema: tool.inputSchema ?? { type: 'object', properties: {} }
	}));
}

export function createMcpTransport(server: McpServerRow) {
	const secrets = getMcpSecrets(server);
	const requestInit =
		secrets.headers && Object.keys(secrets.headers).length > 0
			? { headers: secrets.headers }
			: undefined;

	if (server.transport === 'stdio') {
		return new StdioClientTransport({
			command: server.command ?? '',
			args: server.args ?? [],
			cwd: server.cwd ?? undefined,
			env: secrets.env
		});
	}

	if (server.transport === 'sse') {
		return new SSEClientTransport(new URL(server.url ?? ''), { requestInit });
	}

	return new StreamableHTTPClientTransport(new URL(server.url ?? ''), { requestInit });
}

async function connectMcpClient(
	server: McpServerRow,
	onToolsChanged: (tools: McpToolInfo[] | null) => void
): Promise<McpClientLike> {
	const client = new Client(
		{ name: 'personachat', version: '0.0.1' },
		{
			listChanged: {
				tools: {
					onChanged(error, tools) {
						onToolsChanged(error || !tools ? null : (tools as McpToolInfo[]));
					}
				}
			}
		}
	);
	await client.connect(createMcpTransport(server));
	return client;
}

export class McpClientManager {
	private readonly clientFactory: McpClientFactory;
	private readonly stdioIdleMs: number;
	private readonly clients = new Map<string, ManagedClient>();
	private readonly toolCache = new Map<string, ToolCacheEntry>();

	constructor(options: { clientFactory?: McpClientFactory; stdioIdleMs?: number } = {}) {
		this.clientFactory = options.clientFactory ?? connectMcpClient;
		this.stdioIdleMs = options.stdioIdleMs ?? defaultStdioIdleMs;
	}

	async listTools(server: McpServerRow): Promise<PublicMcpTool[]> {
		const updatedAtMs = serverUpdatedAtMs(server);
		const cached = this.toolCache.get(server.id);
		if (cached && cached.updatedAtMs === updatedAtMs) return cached.tools;

		const client = await this.getClient(server);
		const result = await client.listTools();
		const tools = normalizePublicMcpTools(server, result.tools as McpToolInfo[]);
		this.toolCache.set(server.id, { updatedAtMs, tools });
		this.scheduleIdleClose(server);
		return tools;
	}

	async callTool(
		server: McpServerRow,
		toolName: string,
		args: Record<string, unknown>
	): Promise<McpToolCallResult> {
		const client = await this.getClient(server);
		try {
			return (await client.callTool({ name: toolName, arguments: args })) as McpToolCallResult;
		} finally {
			this.scheduleIdleClose(server);
		}
	}

	invalidateTools(serverId: string): void {
		this.toolCache.delete(serverId);
	}

	async closeServer(serverId: string): Promise<void> {
		const managed = this.clients.get(serverId);
		if (!managed) return;
		if (managed.idleTimer) clearTimeout(managed.idleTimer);
		this.clients.delete(serverId);
		await managed.client.close();
	}

	async closeAll(): Promise<void> {
		await Promise.all([...this.clients.keys()].map((serverId) => this.closeServer(serverId)));
	}

	private async getClient(server: McpServerRow): Promise<McpClientLike> {
		const updatedAtMs = serverUpdatedAtMs(server);
		const managed = this.clients.get(server.id);

		if (managed && managed.updatedAtMs === updatedAtMs) {
			if (managed.idleTimer) {
				clearTimeout(managed.idleTimer);
				managed.idleTimer = undefined;
			}
			return managed.client;
		}

		if (managed) await this.closeServer(server.id);

		const client = await this.clientFactory(server, (tools) => {
			this.invalidateTools(server.id);
			if (tools) {
				this.toolCache.set(server.id, {
					updatedAtMs: serverUpdatedAtMs(server),
					tools: normalizePublicMcpTools(server, tools)
				});
			}
		});
		this.clients.set(server.id, { client, updatedAtMs });
		return client;
	}

	private scheduleIdleClose(server: McpServerRow): void {
		if (server.transport !== 'stdio') return;

		const managed = this.clients.get(server.id);
		if (!managed) return;
		if (managed.idleTimer) clearTimeout(managed.idleTimer);

		if (this.stdioIdleMs <= 0) {
			void this.closeServer(server.id);
			return;
		}

		managed.idleTimer = setTimeout(() => {
			void this.closeServer(server.id);
		}, this.stdioIdleMs);
	}
}

export const defaultMcpClientManager = new McpClientManager();

export async function listToolsForMcpServer(server: McpServerRow): Promise<PublicMcpTool[]> {
	return defaultMcpClientManager.listTools(server);
}

export async function testMcpServer(server: McpServerRow): Promise<PublicMcpTool[]> {
	try {
		const tools = await listToolsForMcpServer(server);
		await markMcpServerStatus(server.id, 'ok', null);
		return tools;
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unable to connect to MCP server';
		await markMcpServerStatus(server.id, 'error', message);
		throw error;
	}
}
