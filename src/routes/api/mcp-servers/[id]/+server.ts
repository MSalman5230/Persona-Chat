import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { readJsonRequest, rethrowValidationAsBadRequest } from '$lib/server/api';
import { requireAdmin } from '$lib/server/auth/guards';
import { deleteMcpServer, getMcpServer, updateMcpServer } from '$lib/server/repositories/mcp';
import type { McpUpdateInput } from '$lib/server/repositories/mcp';

export const GET: RequestHandler = async ({ locals, params }) => {
	await requireAdmin(locals);
	const server = await getMcpServer(params.id);
	if (!server) error(404, 'MCP server not found');
	const { secret: _secret, ...publicServer } = server;
	return json({ server: publicServer });
};

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	await requireAdmin(locals);
	const body = (await readJsonRequest(request, 'Invalid MCP server update')) as McpUpdateInput;
	try {
		const server = await updateMcpServer(params.id, body);
		return json({ server });
	} catch (cause) {
		rethrowValidationAsBadRequest(cause, 'Invalid MCP server update');
	}
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	await requireAdmin(locals);
	await deleteMcpServer(params.id);
	return json({ ok: true });
};
