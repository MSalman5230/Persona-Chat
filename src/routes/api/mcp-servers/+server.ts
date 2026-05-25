import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';

import { parseJsonRequest } from '$lib/server/api';
import { requireAdmin } from '$lib/server/auth/guards';
import { createMcpServer, listMcpServers } from '$lib/server/repositories/mcp';

const mcpSchema = z.object({
	name: z.string().min(1),
	slug: z.string().min(1),
	transport: z.enum(['stdio', 'streamable_http', 'sse']),
	command: z.string().optional().nullable(),
	args: z.array(z.string()).default([]),
	cwd: z.string().optional().nullable(),
	url: z.string().url().optional().nullable(),
	env: z.record(z.string(), z.string()).default({}),
	headers: z.record(z.string(), z.string()).default({}),
	enabled: z.boolean().default(true)
});

export const GET: RequestHandler = async ({ locals }) => {
	await requireAdmin(locals);
	return json({ servers: await listMcpServers() });
};

export const POST: RequestHandler = async ({ locals, request }) => {
	await requireAdmin(locals);
	const body = await parseJsonRequest(request, mcpSchema, 'Invalid MCP server');
	const server = await createMcpServer(body);
	return json({ server }, { status: 201 });
};
