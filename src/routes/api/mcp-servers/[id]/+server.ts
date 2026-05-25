import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { readJsonRequest, rethrowValidationAsBadRequest } from '$lib/server/api';
import { deleteMcpServer, getMcpServer, updateMcpServer } from '$lib/server/repositories/mcp';
import type { McpUpdateInput } from '$lib/server/repositories/mcp';

export const GET: RequestHandler = async ({ params }) => {
	const server = await getMcpServer(params.id);
	if (!server) error(404, 'MCP server not found');
	const { secret: _secret, ...publicServer } = server;
	return json({ server: publicServer });
};

export const PATCH: RequestHandler = async ({ params, request }) => {
	const body = (await readJsonRequest(request, 'Invalid MCP server update')) as McpUpdateInput;
	try {
		const server = await updateMcpServer(params.id, body);
		return json({ server });
	} catch (cause) {
		rethrowValidationAsBadRequest(cause, 'Invalid MCP server update');
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	await deleteMcpServer(params.id);
	return json({ ok: true });
};
