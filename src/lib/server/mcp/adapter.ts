import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { defineTool } from '@earendil-works/pi-coding-agent';
import type { TSchema } from '@earendil-works/pi-ai';

import type { McpServerRow } from '$lib/server/repositories/mcp';
import {
	getEnabledMcpServerBySlug,
	getMcpSecrets,
	listEnabledMcpServers,
	markMcpServerStatus
} from '$lib/server/repositories/mcp';

export type McpToolInfo = {
	name: string;
	description?: string;
	inputSchema?: Record<string, unknown>;
};

export type PublicMcpTool = {
	name: string;
	description: string;
	serverId: string;
	serverSlug: string;
	originalName: string;
	inputSchema: Record<string, unknown>;
};

export type McpToolCallResult = {
	content?: unknown;
	isError?: boolean;
	[key: string]: unknown;
};

export type McpToolCaller = (
	server: McpServerRow,
	toolName: string,
	args: Record<string, unknown>
) => Promise<McpToolCallResult>;

export type McpClientLike = Pick<Client, 'listTools' | 'callTool' | 'close'>;

export type McpClientFactory = (
	server: McpServerRow,
	onToolsChanged: (tools: McpToolInfo[] | null) => void
) => Promise<McpClientLike>;

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
const mcpMetaToolNames = ['mcp_list_servers', 'mcp_list_tools', 'mcp_call_tool'] as const;

function sanitizeToolSegment(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9_]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, 48);
}

export function mcpToolName(serverSlug: string, toolName: string): string {
	return `mcp_${sanitizeToolSegment(serverSlug)}_${sanitizeToolSegment(toolName)}`;
}

function inputSchemaToToolSchema(schema: Record<string, unknown> | undefined): TSchema {
	if (schema && schema.type === 'object') return schema as TSchema;
	return { type: 'object', properties: {}, additionalProperties: true } as TSchema;
}

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

export type ProgressiveMcpToolDependencies = {
	manager?: McpClientManager;
	listEnabledServers?: () => Promise<McpServerRow[]>;
	getEnabledServerBySlug?: (slug: string) => Promise<McpServerRow | undefined>;
	markServerStatus?: (
		id: string,
		status: 'ok' | 'error',
		lastError?: string | null
	) => Promise<void>;
};

function normalizeMcpContent(
	content: unknown
): Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> {
	if (!Array.isArray(content)) return [{ type: 'text', text: JSON.stringify(content) ?? '' }];

	return content.map((item) => {
		if (item && typeof item === 'object') {
			const record = item as Record<string, unknown>;
			if (record.type === 'text' && typeof record.text === 'string') {
				return { type: 'text', text: record.text };
			}
			if (
				record.type === 'image' &&
				typeof record.data === 'string' &&
				typeof record.mimeType === 'string'
			) {
				return { type: 'image', data: record.data, mimeType: record.mimeType };
			}
		}

		return { type: 'text', text: JSON.stringify(item) ?? '' };
	});
}

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

const callMcpTool: McpToolCaller = async (server, toolName, args) => {
	return defaultMcpClientManager.callTool(server, toolName, args);
};

export function createMcpToolDefinition(
	server: McpServerRow,
	tool: PublicMcpTool,
	caller: McpToolCaller = callMcpTool
): ToolDefinition {
	return defineTool({
		name: tool.name,
		label: `${server.name}: ${tool.originalName}`,
		description: tool.description,
		parameters: inputSchemaToToolSchema(tool.inputSchema),
		executionMode: 'parallel',
		async execute(_toolCallId, params) {
			const result = await caller(server, tool.originalName, params as Record<string, unknown>);
			if (result.isError) {
				throw new Error(mcpErrorMessage(result));
			}
			return {
				content: normalizeMcpContent(result.content),
				details: result
			};
		}
	});
}

function metaToolSchema(
	properties: Record<string, unknown>,
	required: string[] = []
): TSchema {
	return {
		type: 'object',
		properties,
		required,
		additionalProperties: false
	} as TSchema;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

function stringParam(params: unknown, key: string): string {
	if (!isRecord(params)) throw new Error(`${key} is required`);
	const value = params[key];
	if (typeof value !== 'string' || !value) {
		throw new Error(`${key} is required`);
	}
	return value;
}

function objectParam(params: unknown, key: string): Record<string, unknown> {
	if (!isRecord(params)) throw new Error(`${key} is required`);
	const value = params[key];
	if (value === undefined) return {};
	if (!isRecord(value)) throw new Error(`${key} must be a JSON object`);
	return value;
}

function mcpErrorMessage(result: McpToolCallResult): string {
	return normalizeMcpContent(result.content)
		.map((item) => ('text' in item ? item.text : `[${item.mimeType} image]`))
		.join('\n');
}

function modelToolDetails(tool: PublicMcpTool) {
	return {
		name: tool.originalName,
		description: tool.description,
		inputSchema: tool.inputSchema
	};
}

function modelServerMetadata(server: McpServerRow) {
	return {
		slug: server.slug,
		name: server.name,
		transport: server.transport,
		status: server.status,
		lastError: server.lastError,
		lastCheckedAt: server.lastCheckedAt?.toISOString() ?? null,
		updatedAt: server.updatedAt.toISOString(),
		command: server.transport === 'stdio' ? server.command : undefined,
		url: server.transport !== 'stdio' ? server.url : undefined
	};
}

async function requireEnabledMcpServer(
	slug: string,
	getServerBySlug: (slug: string) => Promise<McpServerRow | undefined>
): Promise<McpServerRow> {
	const server = await getServerBySlug(slug);
	if (!server) throw new Error(`Enabled MCP server not found: ${slug}`);
	return server;
}

function jsonToolResult(details: unknown) {
	return {
		content: [{ type: 'text' as const, text: JSON.stringify(details, null, 2) }],
		details
	};
}

export function getMcpMetaToolNames(): string[] {
	return [...mcpMetaToolNames];
}

export function buildProgressiveMcpToolDefinitions(
	dependencies: ProgressiveMcpToolDependencies = {}
): ToolDefinition[] {
	const manager = dependencies.manager ?? defaultMcpClientManager;
	const listEnabledServers = dependencies.listEnabledServers ?? listEnabledMcpServers;
	const getEnabledServerBySlug = dependencies.getEnabledServerBySlug ?? getEnabledMcpServerBySlug;
	const markServerStatus = dependencies.markServerStatus ?? markMcpServerStatus;

	return [
		defineTool({
			name: 'mcp_list_servers',
			label: 'List MCP Servers',
			description: 'List enabled MCP servers available for progressive MCP tool discovery.',
			parameters: metaToolSchema({}),
			executionMode: 'parallel',
			async execute() {
				const servers = (await listEnabledServers()).map(modelServerMetadata);
				return jsonToolResult({ servers });
			}
		}),
		defineTool({
			name: 'mcp_list_tools',
			label: 'List MCP Tools',
			description:
				'Connect to one enabled MCP server by slug and list its original tool names, descriptions, and input schemas.',
			parameters: metaToolSchema(
				{
					server: {
						type: 'string',
						description: 'Server slug returned by mcp_list_servers.'
					}
				},
				['server']
			),
			executionMode: 'parallel',
			async execute(_toolCallId, params) {
				const server = await requireEnabledMcpServer(
					stringParam(params, 'server'),
					getEnabledServerBySlug
				);
				try {
					const tools = await manager.listTools(server);
					await markServerStatus(server.id, 'ok', null);
					return jsonToolResult({
						server: { slug: server.slug, name: server.name },
						tools: tools.map(modelToolDetails)
					});
				} catch (error) {
					const message = error instanceof Error ? error.message : 'Unable to list MCP tools';
					await markServerStatus(server.id, 'error', message);
					throw error;
				}
			}
		}),
		defineTool({
			name: 'mcp_call_tool',
			label: 'Call MCP Tool',
			description:
				'Connect to one enabled MCP server by slug and call one original MCP tool name with JSON arguments.',
			parameters: metaToolSchema(
				{
					server: {
						type: 'string',
						description: 'Server slug returned by mcp_list_servers.'
					},
					name: {
						type: 'string',
						description: 'Original MCP tool name returned by mcp_list_tools.'
					},
					arguments: {
						type: 'object',
						description: 'JSON arguments for the selected MCP tool.',
						additionalProperties: true
					}
				},
				['server', 'name', 'arguments']
			),
			executionMode: 'parallel',
			async execute(_toolCallId, params) {
				const server = await requireEnabledMcpServer(
					stringParam(params, 'server'),
					getEnabledServerBySlug
				);
				const name = stringParam(params, 'name');
				const args = objectParam(params, 'arguments');
				try {
					const result = await manager.callTool(server, name, args);
					if (result.isError) throw new Error(mcpErrorMessage(result));
					await markServerStatus(server.id, 'ok', null);
					return {
						content: normalizeMcpContent(result.content),
						details: result
					};
				} catch (error) {
					const message = error instanceof Error ? error.message : 'Unable to call MCP tool';
					await markServerStatus(server.id, 'error', message);
					throw error;
				}
			}
		})
	];
}

export async function buildMcpToolDefinitions(): Promise<ToolDefinition[]> {
	const servers = await listEnabledMcpServers();
	const definitions: ToolDefinition[] = [];

	for (const server of servers) {
		let tools: PublicMcpTool[] = [];
		try {
			tools = await listToolsForMcpServer(server);
			await markMcpServerStatus(server.id, 'ok', null);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unable to load MCP tools';
			await markMcpServerStatus(server.id, 'error', message);
			continue;
		}

		for (const tool of tools) {
			definitions.push(createMcpToolDefinition(server, tool));
		}
	}

	return definitions;
}
