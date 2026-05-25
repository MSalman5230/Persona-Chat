import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { requireAdmin } from '$lib/server/auth-guard';
import { getMcpServer } from '$lib/server/repositories/mcp';
import { listToolsForMcpServer } from '$lib/server/mcp/adapter';

export const GET: RequestHandler = async (event) => {
	requireAdmin(event);
	const { params } = event;
	const server = await getMcpServer(params.id);
	if (!server) error(404, 'MCP server not found');
	const tools = await listToolsForMcpServer(server);
	return json({ tools });
};
