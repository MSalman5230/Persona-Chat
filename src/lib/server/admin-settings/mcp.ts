import { testMcpServer } from '$lib/server/mcp/adapter';
import {
	buildMcpJsonSyncOperations,
	parseMcpJsonConfig,
	serializeMcpJsonConfig
} from '$lib/server/mcp/json-config';
import {
	createMcpServer,
	deleteMcpServer,
	getMcpServer,
	listMcpServers,
	updateMcpServer
} from '$lib/server/repositories/mcp';
import type { PublicMcpServer } from '$lib/server/repositories/mcp';

export async function listAdminMcpServers(): Promise<PublicMcpServer[]> {
	return listMcpServers();
}

export function serializeAdminMcpJson(mcpServers: PublicMcpServer[]): string {
	return serializeMcpJsonConfig(mcpServers);
}

export function emptyAdminMcpJson(): string {
	return serializeMcpJsonConfig([]);
}

export async function syncAdminMcpJson(mcpJson: string): Promise<string> {
	const config = parseMcpJsonConfig(mcpJson);
	const existingServers = await listMcpServers();
	const { upserts, deletes } = buildMcpJsonSyncOperations(config, existingServers);

	for (const upsert of upserts) {
		if (upsert.mode === 'update') {
			await updateMcpServer(upsert.id, upsert.payload);
		} else {
			await createMcpServer(upsert.payload);
		}
	}

	for (const deletedServer of deletes) {
		await deleteMcpServer(deletedServer.id);
	}

	return `Saved ${upserts.length} MCP server${upserts.length === 1 ? '' : 's'}${
		deletes.length === 0
			? ''
			: `, deleted ${deletes.length} MCP server${deletes.length === 1 ? '' : 's'}`
	}`;
}

export async function deleteAdminMcpServer(id: string): Promise<void> {
	await deleteMcpServer(id);
}

export async function testAdminMcpServer(id: string): Promise<string> {
	if (!id) throw new Error('MCP server ID is required');

	const server = await getMcpServer(id);
	if (!server) throw new Error('MCP server not found');

	const tools = await testMcpServer(server);
	return `${server.name} returned ${tools.length} tool(s)`;
}
