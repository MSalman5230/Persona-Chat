import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { deleteMcpServer, getMcpServer, updateMcpServer } from '$lib/server/repositories/mcp';

export const GET: RequestHandler = async ({ params }) => {
	const server = await getMcpServer(params.id);
	if (!server) error(404, 'MCP server not found');
	const { secret: _secret, ...publicServer } = server;
	return json({ server: publicServer });
};

export const PATCH: RequestHandler = async ({ params, request }) => {
	const server = await updateMcpServer(params.id, await request.json());
	return json({ server });
};

export const DELETE: RequestHandler = async ({ params }) => {
	await deleteMcpServer(params.id);
	return json({ ok: true });
};
