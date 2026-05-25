import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { requireAdmin } from '$lib/server/auth/guards';
import { getMcpServer } from '$lib/server/repositories/mcp';
import { testMcpServer } from '$lib/server/mcp/adapter';

export const POST: RequestHandler = async ({ locals, params }) => {
	await requireAdmin(locals);
	const server = await getMcpServer(params.id);
	if (!server) error(404, 'MCP server not found');
	const tools = await testMcpServer(server);
	return json({ ok: true, tools });
};
