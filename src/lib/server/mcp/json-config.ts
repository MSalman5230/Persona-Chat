import type { McpInput, McpUpdateInput, PublicMcpServer } from '$lib/server/repositories/mcp';

type McpTransport = 'stdio' | 'streamable_http' | 'sse';

type ParsedMcpJsonServer = {
	slug: string;
	name?: string;
	transport: McpTransport;
	command?: string;
	args?: string[];
	cwd?: string;
	url?: string;
	enabled?: boolean;
	env?: Record<string, string>;
	headers?: Record<string, string>;
	hasEnv: boolean;
	hasHeaders: boolean;
};

export type ParsedMcpJsonConfig = {
	servers: ParsedMcpJsonServer[];
};

export type McpJsonUpsert =
	| {
			mode: 'create';
			slug: string;
			payload: McpInput;
	  }
	| {
			mode: 'update';
			slug: string;
			id: string;
			payload: McpUpdateInput;
	  };

export type McpJsonDelete = {
	id: string;
	slug: string;
};

export type McpJsonSyncOperations = {
	upserts: McpJsonUpsert[];
	deletes: McpJsonDelete[];
};

const slugPattern = /^[a-zA-Z0-9_-]+$/;
const transports = new Set<McpTransport>(['stdio', 'streamable_http', 'sse']);

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

function optionalString(
	record: Record<string, unknown>,
	key: string,
	label: string
): string | undefined {
	const value = record[key];
	if (value === undefined || value === null) return undefined;
	if (typeof value !== 'string') throw new Error(`${label}.${key} must be a string`);
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function optionalBoolean(
	record: Record<string, unknown>,
	key: string,
	label: string
): boolean | undefined {
	const value = record[key];
	if (value === undefined || value === null) return undefined;
	if (typeof value !== 'boolean') throw new Error(`${label}.${key} must be a boolean`);
	return value;
}

function optionalStringArray(
	record: Record<string, unknown>,
	key: string,
	label: string
): string[] | undefined {
	const value = record[key];
	if (value === undefined || value === null) return undefined;
	if (!Array.isArray(value)) throw new Error(`${label}.${key} must be an array of strings`);

	return value.map((item, index) => {
		if (typeof item !== 'string') throw new Error(`${label}.${key}[${index}] must be a string`);
		return item;
	});
}

function optionalStringRecord(
	record: Record<string, unknown>,
	key: string,
	label: string
): Record<string, string> | undefined {
	const value = record[key];
	if (value === undefined || value === null) return undefined;
	if (!isRecord(value)) throw new Error(`${label}.${key} must be a JSON object`);

	const result: Record<string, string> = {};
	for (const [itemKey, itemValue] of Object.entries(value)) {
		if (typeof itemValue !== 'string') {
			throw new Error(`${label}.${key}.${itemKey} must be a string`);
		}
		result[itemKey] = itemValue;
	}
	return result;
}

function validateUrl(value: string | undefined, label: string): void {
	if (!value) return;
	try {
		new URL(value);
	} catch {
		throw new Error(`${label}.url must be a valid URL`);
	}
}

function parseTransport(
	record: Record<string, unknown>,
	label: string,
	command: string | undefined,
	url: string | undefined
): McpTransport {
	const explicit = optionalString(record, 'transport', label);
	if (explicit !== undefined) {
		if (!transports.has(explicit as McpTransport)) {
			throw new Error(`${label}.transport must be "stdio", "streamable_http", or "sse"`);
		}
		const transport = explicit as McpTransport;
		if (transport === 'stdio' && !command) {
			throw new Error(`${label} uses stdio and needs a command`);
		}
		if (transport !== 'stdio' && !url) {
			throw new Error(`${label} uses ${transport} and needs a url`);
		}
		return transport;
	}

	if (command && url) {
		throw new Error(`${label} has both command and url; set transport explicitly`);
	}
	if (command) return 'stdio';
	if (url) return 'streamable_http';

	throw new Error(`${label} needs either command or url`);
}

function parseServer(slug: string, value: unknown): ParsedMcpJsonServer {
	const label = `mcpServers.${slug}`;
	if (!slugPattern.test(slug)) {
		throw new Error(`${label} key must contain only letters, numbers, underscores, or dashes`);
	}
	if (!isRecord(value)) throw new Error(`${label} must be a JSON object`);

	const name = optionalString(value, 'name', label);
	const command = optionalString(value, 'command', label);
	const args = optionalStringArray(value, 'args', label);
	const cwd = optionalString(value, 'cwd', label);
	const url = optionalString(value, 'url', label);
	const enabled = optionalBoolean(value, 'enabled', label);
	const env = optionalStringRecord(value, 'env', label);
	const headers = optionalStringRecord(value, 'headers', label);

	validateUrl(url, label);
	const transport = parseTransport(value, label, command, url);

	return {
		slug,
		...(name !== undefined ? { name } : {}),
		transport,
		...(command !== undefined ? { command } : {}),
		...(args !== undefined ? { args } : {}),
		...(cwd !== undefined ? { cwd } : {}),
		...(url !== undefined ? { url } : {}),
		...(enabled !== undefined ? { enabled } : {}),
		...(env !== undefined ? { env } : {}),
		...(headers !== undefined ? { headers } : {}),
		hasEnv: Object.hasOwn(value, 'env'),
		hasHeaders: Object.hasOwn(value, 'headers')
	};
}

export function parseMcpJsonConfig(value: string): ParsedMcpJsonConfig {
	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch (error) {
		throw new Error(error instanceof Error ? `Invalid MCP JSON: ${error.message}` : 'Invalid MCP JSON');
	}

	if (!isRecord(parsed)) throw new Error('MCP JSON must be a JSON object');
	if (!isRecord(parsed.mcpServers)) throw new Error('MCP JSON must contain an mcpServers object');

	return {
		servers: Object.entries(parsed.mcpServers).map(([slug, server]) => parseServer(slug, server))
	};
}

function serializeServer(server: PublicMcpServer): Record<string, unknown> {
	const entry: Record<string, unknown> = {
		name: server.name
	};

	if (server.transport === 'stdio') {
		entry.command = server.command ?? '';
		if (server.args.length > 0) entry.args = server.args;
		if (server.cwd) entry.cwd = server.cwd;
	} else {
		entry.url = server.url ?? '';
		if (server.transport === 'sse') entry.transport = 'sse';
	}

	if (!server.enabled) entry.enabled = false;
	return entry;
}

export function serializeMcpJsonConfig(servers: PublicMcpServer[]): string {
	const mcpServers = Object.fromEntries(
		[...servers]
			.sort((left, right) => left.slug.localeCompare(right.slug))
			.map((server) => [server.slug, serializeServer(server)])
	);

	return JSON.stringify({ mcpServers }, null, 2);
}

export function buildMcpJsonUpserts(
	config: ParsedMcpJsonConfig,
	existingServers: Array<Pick<PublicMcpServer, 'id' | 'name' | 'slug' | 'enabled'>>
): McpJsonUpsert[] {
	const existingBySlug = new Map(existingServers.map((server) => [server.slug, server]));

	return config.servers.map((server): McpJsonUpsert => {
		const existing = existingBySlug.get(server.slug);
		const payload = {
			name: server.name ?? existing?.name ?? server.slug,
			slug: server.slug,
			transport: server.transport,
			command: server.transport === 'stdio' ? (server.command ?? null) : null,
			args: server.transport === 'stdio' ? (server.args ?? []) : [],
			cwd: server.transport === 'stdio' ? (server.cwd ?? null) : null,
			url: server.transport === 'stdio' ? null : (server.url ?? null),
			enabled: server.enabled ?? existing?.enabled ?? true,
			...(server.hasEnv ? { env: server.env ?? {} } : {}),
			...(server.hasHeaders ? { headers: server.headers ?? {} } : {})
		};

		return existing
			? { mode: 'update', slug: server.slug, id: existing.id, payload }
			: { mode: 'create', slug: server.slug, payload };
	});
}

export function buildMcpJsonSyncOperations(
	config: ParsedMcpJsonConfig,
	existingServers: Array<Pick<PublicMcpServer, 'id' | 'name' | 'slug' | 'enabled'>>
): McpJsonSyncOperations {
	const submittedSlugs = new Set(config.servers.map((server) => server.slug));
	const deletes = existingServers
		.filter((server) => !submittedSlugs.has(server.slug))
		.map((server) => ({ id: server.id, slug: server.slug }));

	return {
		upserts: buildMcpJsonUpserts(config, existingServers),
		deletes
	};
}
