import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { decryptJson, encryptJson } from '$lib/server/crypto';
import { db } from '$lib/server/db';
import { mcpServers, type EncryptedJsonPayload, type McpSecretPayload } from '$lib/server/db/schema';

const mcpBaseSchema = z.object({
	name: z.string().min(1),
	slug: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/),
	transport: z.enum(['stdio', 'streamable_http', 'sse']),
	command: z.string().optional().nullable(),
	args: z.array(z.string()).default([]),
	cwd: z.string().optional().nullable(),
	url: z.string().url().optional().nullable(),
	env: z.record(z.string(), z.string()).default({}),
	headers: z.record(z.string(), z.string()).default({}),
	enabled: z.boolean().default(true)
});

const mcpInputSchema = mcpBaseSchema
	.superRefine((value, ctx) => {
		if (value.transport === 'stdio' && !value.command) {
			ctx.addIssue({ code: 'custom', message: 'Local stdio MCP servers need a command' });
		}
		if (value.transport !== 'stdio' && !value.url) {
			ctx.addIssue({ code: 'custom', message: 'Remote MCP servers need a URL' });
		}
	});

const mcpUpdateSchema = mcpBaseSchema.partial();

export type McpInput = z.input<typeof mcpInputSchema>;
export type McpUpdateInput = z.input<typeof mcpUpdateSchema>;
export type McpServerRow = typeof mcpServers.$inferSelect;
export type PublicMcpServer = Omit<McpServerRow, 'secret'> & {
	hasEnvSecrets: boolean;
	hasHeaderSecrets: boolean;
};

function decryptMcpSecret(secret: EncryptedJsonPayload | null | undefined): McpSecretPayload {
	return decryptJson<McpSecretPayload>(secret) ?? {};
}

function buildSecret(input: Pick<McpInput, 'env' | 'headers'>): EncryptedJsonPayload | null {
	const secret: McpSecretPayload = {};
	if (input.env && Object.keys(input.env).length > 0) secret.env = input.env;
	if (input.headers && Object.keys(input.headers).length > 0) secret.headers = input.headers;
	return Object.keys(secret).length > 0 ? encryptJson(secret) : null;
}

function serializeMcp(row: McpServerRow): PublicMcpServer {
	const { secret: _secret, ...publicRow } = row;
	let hasEnvSecrets = Boolean(row.secret);
	let hasHeaderSecrets = Boolean(row.secret);

	if (row.secret) {
		try {
			const secret = decryptMcpSecret(row.secret);
			hasEnvSecrets = Boolean(secret.env && Object.keys(secret.env).length > 0);
			hasHeaderSecrets = Boolean(secret.headers && Object.keys(secret.headers).length > 0);
		} catch {
			// If the encryption key is not available, keep the public signal conservative
			// without exposing or requiring the secret payload during settings load.
			hasEnvSecrets = true;
			hasHeaderSecrets = true;
		}
	}

	return {
		...publicRow,
		hasEnvSecrets,
		hasHeaderSecrets
	};
}

export async function listMcpServers(): Promise<PublicMcpServer[]> {
	const rows = await db.select().from(mcpServers).orderBy(desc(mcpServers.createdAt));
	return rows.map(serializeMcp);
}

export async function listEnabledMcpServers(): Promise<McpServerRow[]> {
	return db
		.select()
		.from(mcpServers)
		.where(eq(mcpServers.enabled, true))
		.orderBy(desc(mcpServers.createdAt));
}

export async function getMcpServer(id: string): Promise<McpServerRow | undefined> {
	const [row] = await db.select().from(mcpServers).where(eq(mcpServers.id, id)).limit(1);
	return row;
}

export async function createMcpServer(input: McpInput): Promise<PublicMcpServer> {
	const parsed = mcpInputSchema.parse(input);
	const [row] = await db
		.insert(mcpServers)
		.values({
			name: parsed.name,
			slug: parsed.slug,
			transport: parsed.transport,
			command: parsed.command ?? null,
			args: parsed.args,
			cwd: parsed.cwd ?? null,
			url: parsed.url ?? null,
			secret: buildSecret(parsed),
			enabled: parsed.enabled
		})
		.returning();
	return serializeMcp(row);
}

export async function updateMcpServer(id: string, input: McpUpdateInput): Promise<PublicMcpServer> {
	const current = await getMcpServer(id);
	if (!current) throw new Error('MCP server not found');

	const parsed = mcpUpdateSchema.parse(input);
	let nextSecret = current.secret;
	if (parsed.env !== undefined || parsed.headers !== undefined) {
		const secret = {
			...decryptMcpSecret(current.secret),
			...(parsed.env !== undefined ? { env: parsed.env } : {}),
			...(parsed.headers !== undefined ? { headers: parsed.headers } : {})
		} satisfies McpSecretPayload;
		nextSecret =
			(secret.env && Object.keys(secret.env).length > 0) ||
			(secret.headers && Object.keys(secret.headers).length > 0)
				? encryptJson(secret)
				: null;
	}

	const [row] = await db
		.update(mcpServers)
		.set({
			...(parsed.name !== undefined ? { name: parsed.name } : {}),
			...(parsed.slug !== undefined ? { slug: parsed.slug } : {}),
			...(parsed.transport !== undefined ? { transport: parsed.transport } : {}),
			...(parsed.command !== undefined ? { command: parsed.command ?? null } : {}),
			...(parsed.args !== undefined ? { args: parsed.args } : {}),
			...(parsed.cwd !== undefined ? { cwd: parsed.cwd ?? null } : {}),
			...(parsed.url !== undefined ? { url: parsed.url ?? null } : {}),
			...(parsed.enabled !== undefined ? { enabled: parsed.enabled } : {}),
			secret: nextSecret,
			updatedAt: new Date()
		})
		.where(eq(mcpServers.id, id))
		.returning();
	return serializeMcp(row);
}

export async function deleteMcpServer(id: string): Promise<void> {
	await db.delete(mcpServers).where(eq(mcpServers.id, id));
}

export async function markMcpServerStatus(
	id: string,
	status: 'ok' | 'error',
	lastError: string | null = null
): Promise<void> {
	await db
		.update(mcpServers)
		.set({ status, lastError, lastCheckedAt: new Date(), updatedAt: new Date() })
		.where(eq(mcpServers.id, id));
}

export async function getEnabledMcpServerBySlug(slug: string): Promise<McpServerRow | undefined> {
	const [row] = await db
		.select()
		.from(mcpServers)
		.where(and(eq(mcpServers.slug, slug), eq(mcpServers.enabled, true)))
		.limit(1);
	return row;
}

export function getMcpSecrets(row: McpServerRow): McpSecretPayload {
	return decryptMcpSecret(row.secret);
}
