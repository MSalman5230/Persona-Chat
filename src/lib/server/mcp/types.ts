import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

import type { McpServerRow } from '$lib/server/repositories/mcp';

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

export type ProgressiveMcpToolDependencies = {
	manager?: {
		listTools(server: McpServerRow): Promise<PublicMcpTool[]>;
		callTool(
			server: McpServerRow,
			toolName: string,
			args: Record<string, unknown>
		): Promise<McpToolCallResult>;
	};
	listEnabledServers?: () => Promise<McpServerRow[]>;
	getEnabledServerBySlug?: (slug: string) => Promise<McpServerRow | undefined>;
	markServerStatus?: (
		id: string,
		status: 'ok' | 'error',
		lastError?: string | null
	) => Promise<void>;
};
