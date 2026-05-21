import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { defineTool } from '@earendil-works/pi-coding-agent';
import type { TSchema } from '@earendil-works/pi-ai';

import type { McpServerRow } from '$lib/server/repositories/mcp';
import {
	getEnabledMcpServerBySlug,
	listEnabledMcpServers,
	markMcpServerStatus
} from '$lib/server/repositories/mcp';
import { isRecord } from '$lib/server/json';

import { defaultMcpClientManager } from './client';
import { jsonToolResult, mcpErrorMessage, normalizeMcpContent } from './content';
import type { ProgressiveMcpToolDependencies, PublicMcpTool } from './types';

const mcpMetaToolNames = ['mcp_list_servers', 'mcp_list_tools', 'mcp_call_tool'] as const;

function metaToolSchema(properties: Record<string, unknown>, required: string[] = []): TSchema {
	return {
		type: 'object',
		properties,
		required,
		additionalProperties: false
	} as TSchema;
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

function modelToolDetails(tool: PublicMcpTool) {
	return {
		name: tool.originalName,
		description: tool.description,
		inputSchema: tool.inputSchema
	};
}

function dateToIso(value: Date | string | null | undefined): string | null {
	if (!value) return null;
	return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function modelServerMetadata(server: McpServerRow) {
	return {
		slug: server.slug,
		name: server.name,
		transport: server.transport,
		status: server.status,
		lastError: server.lastError,
		lastCheckedAt: dateToIso(server.lastCheckedAt),
		updatedAt: dateToIso(server.updatedAt),
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

export function buildProgressiveMcpToolDefinitions(
	dependencies: ProgressiveMcpToolDependencies = {}
): ToolDefinition[] {
	const manager = dependencies.manager ?? defaultMcpClientManager;
	const listEnabledServers = dependencies.listEnabledServers ?? listEnabledMcpServers;
	const getEnabledServerBySlug = dependencies.getEnabledServerBySlug ?? getEnabledMcpServerBySlug;
	const markServerStatus = dependencies.markServerStatus ?? markMcpServerStatus;

	return [
		defineTool({
			name: mcpMetaToolNames[0],
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
			name: mcpMetaToolNames[1],
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
			name: mcpMetaToolNames[2],
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
