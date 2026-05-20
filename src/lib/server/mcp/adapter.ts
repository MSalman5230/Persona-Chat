import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { defineTool } from '@earendil-works/pi-coding-agent';
import type { TSchema } from '@earendil-works/pi-ai';

import type { McpServerRow } from '$lib/server/repositories/mcp';
import { getMcpSecrets, listEnabledMcpServers, markMcpServerStatus } from '$lib/server/repositories/mcp';

type McpToolInfo = {
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

async function withMcpClient<T>(server: McpServerRow, fn: (client: Client) => Promise<T>): Promise<T> {
	const secrets = getMcpSecrets(server);
	const client = new Client({ name: 'personachat', version: '0.0.1' });
	const transport =
		server.transport === 'stdio'
			? new StdioClientTransport({
					command: server.command ?? '',
					args: server.args ?? [],
					cwd: server.cwd ?? undefined,
					env: secrets.env
				})
			: new StreamableHTTPClientTransport(new URL(server.url ?? ''), {
					requestInit:
						secrets.headers && Object.keys(secrets.headers).length > 0
							? { headers: secrets.headers }
							: undefined
				});

	await client.connect(transport);
	try {
		return await fn(client);
	} finally {
		await client.close();
	}
}

function normalizeMcpContent(
	content: unknown
): Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> {
	if (!Array.isArray(content)) return [{ type: 'text', text: JSON.stringify(content) }];

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

		return { type: 'text', text: JSON.stringify(item) };
	});
}

export async function listToolsForMcpServer(server: McpServerRow): Promise<PublicMcpTool[]> {
	const tools = await withMcpClient(server, async (client) => {
		const result = await client.listTools();
		return result.tools as McpToolInfo[];
	});

	return tools.map((tool) => ({
		name: mcpToolName(server.slug, tool.name),
		description: tool.description ?? `MCP tool ${tool.name} from ${server.name}`,
		serverId: server.id,
		serverSlug: server.slug,
		originalName: tool.name,
		inputSchema: tool.inputSchema ?? { type: 'object', properties: {} }
	}));
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
	return withMcpClient(server, (client) => client.callTool({ name: toolName, arguments: args }));
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
				throw new Error(
					normalizeMcpContent(result.content)
						.map((item) => ('text' in item ? item.text : `[${item.mimeType} image]`))
						.join('\n')
				);
			}
			return {
				content: normalizeMcpContent(result.content),
				details: result
			};
		}
	});
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
