import { and, asc, eq, ne } from 'drizzle-orm';

import {
	agentDefaultPatchSchema,
	agentInputSchema,
	orderAgents,
	uniqueStrings,
	type Agent,
	type AgentDefaultPatchInput,
	type AgentInput,
	type AgentOption,
	type AgentToolOption
} from '$lib/server/agents';
import { appTools } from '$lib/server/agent/tools';
import { db } from '$lib/server/db';
import { agents } from '$lib/server/db/schema';
import { runtimeResourceFilter } from '$lib/server/resource-policy';
import { listMcpServers } from './mcp';

export type AgentRow = typeof agents.$inferSelect;
type AgentDatabase = Pick<typeof db, 'delete' | 'insert' | 'select' | 'update'>;

const appToolNames = appTools.map((tool) => tool.name);
const appToolNameSet = new Set(appToolNames);

function serializeAgent(row: AgentRow): Agent {
	const { userId: _userId, ...publicRow } = row;
	return {
		...publicRow,
		toolNames: row.toolNames.filter((name) => appToolNameSet.has(name)),
		mcpServerIds: row.mcpServerIds
	};
}

function defaultToolNames(toolNames: string[] | undefined): string[] {
	return toolNames === undefined ? appToolNames : toolNames;
}

async function normalizeMcpServerIds(ids: string[]): Promise<string[]> {
	const allowed = new Set((await listMcpServers(runtimeResourceFilter())).map((server) => server.id));
	return uniqueStrings(ids).filter((id) => allowed.has(id));
}

async function normalizeAgentInput(input: AgentInput, options: { create: boolean }) {
	const parsed = agentInputSchema.parse(input);
	return {
		name: parsed.name,
		systemPrompt: parsed.systemPrompt,
		toolNames: uniqueStrings(defaultToolNames(options.create ? input.toolNames : parsed.toolNames)).filter(
			(name) => appToolNameSet.has(name)
		),
		mcpServerIds: await normalizeMcpServerIds(parsed.mcpServerIds),
		isDefault: parsed.isDefault
	};
}

function duplicateNameMessage(name: string): string {
	return `An agent named "${name}" already exists`;
}

async function hasAnyAgents(userId: string, database: AgentDatabase = db): Promise<boolean> {
	const rows = await database
		.select({ id: agents.id })
		.from(agents)
		.where(eq(agents.userId, userId))
		.limit(1);
	return rows.length > 0;
}

async function ensureUniqueName(
	userId: string,
	name: string,
	existingId?: string,
	database: AgentDatabase = db
): Promise<void> {
	const rows = await database
		.select({ id: agents.id })
		.from(agents)
		.where(and(eq(agents.userId, userId), eq(agents.name, name)))
		.limit(1);
	if (rows.length > 0 && rows[0].id !== existingId) throw new Error(duplicateNameMessage(name));
}

async function getAgentRow(
	userId: string,
	id: string,
	database: AgentDatabase = db
): Promise<AgentRow | undefined> {
	const [row] = await database
		.select()
		.from(agents)
		.where(and(eq(agents.userId, userId), eq(agents.id, id)))
		.limit(1);
	return row;
}

async function getDefaultAgentRow(
	userId: string,
	database: AgentDatabase = db
): Promise<AgentRow | undefined> {
	const [row] = await database
		.select()
		.from(agents)
		.where(and(eq(agents.userId, userId), eq(agents.isDefault, true)))
		.limit(1);
	return row;
}

async function clearOtherDefaultAgents(
	userId: string,
	id: string,
	database: AgentDatabase = db
): Promise<void> {
	await database
		.update(agents)
		.set({ isDefault: false, updatedAt: new Date() })
		.where(and(eq(agents.userId, userId), eq(agents.isDefault, true), ne(agents.id, id)));
}

async function setAgentAsDefault(
	userId: string,
	id: string,
	database: AgentDatabase = db
): Promise<AgentRow> {
	await clearOtherDefaultAgents(userId, id, database);
	const [row] = await database
		.update(agents)
		.set({ isDefault: true, updatedAt: new Date() })
		.where(and(eq(agents.userId, userId), eq(agents.id, id)))
		.returning();
	if (!row) throw new Error('Agent not found');
	return row;
}

async function promoteFallbackDefault(
	userId: string,
	database: AgentDatabase = db,
	excludeId?: string
): Promise<void> {
	const [fallback] = excludeId
		? await database
				.select()
				.from(agents)
				.where(and(eq(agents.userId, userId), ne(agents.id, excludeId)))
				.orderBy(asc(agents.createdAt))
				.limit(1)
		: await database
				.select()
				.from(agents)
				.where(eq(agents.userId, userId))
				.orderBy(asc(agents.createdAt))
				.limit(1);
	const fallbackId =
		fallback?.id ?? (excludeId ? (await getAgentRow(userId, excludeId, database))?.id : undefined);
	if (!fallbackId) return;
	await setAgentAsDefault(userId, fallbackId, database);
}

async function ensureDefaultAgent(userId: string, database: AgentDatabase = db): Promise<void> {
	const defaultRow = await getDefaultAgentRow(userId, database);
	if (defaultRow) return;
	await promoteFallbackDefault(userId, database);
}

async function deleteAgentRow(id: string, database: AgentDatabase = db): Promise<void> {
	await database.delete(agents).where(eq(agents.id, id));
}

export function listAvailableAgentTools(): AgentToolOption[] {
	return appTools.map((tool) => ({
		name: tool.name,
		label: tool.label,
		description: tool.description
	}));
}

export async function listAgents(userId: string): Promise<Agent[]> {
	const rows = await db.select().from(agents).where(eq(agents.userId, userId));
	return orderAgents(rows.map(serializeAgent));
}

export async function listAgentOptions(userId: string): Promise<AgentOption[]> {
	const rows = await db
		.select({
			id: agents.id,
			name: agents.name,
			isDefault: agents.isDefault
		})
		.from(agents)
		.where(eq(agents.userId, userId));
	return orderAgents(rows);
}

export async function getAgent(userId: string, id: string): Promise<Agent | undefined> {
	const row = await getAgentRow(userId, id);
	return row ? serializeAgent(row) : undefined;
}

export async function getDefaultAgent(userId: string): Promise<Agent | null> {
	const row = await getDefaultAgentRow(userId);
	return row ? serializeAgent(row) : null;
}

export async function createAgent(userId: string, input: AgentInput): Promise<Agent> {
	const parsed = await normalizeAgentInput(input, { create: true });

	return db.transaction(async (tx) => {
		const hadAgents = await hasAnyAgents(userId, tx);
		await ensureUniqueName(userId, parsed.name, undefined, tx);
		const shouldDefault = parsed.isDefault ?? !hadAgents;
		const [row] = await tx
			.insert(agents)
			.values({
				userId,
				name: parsed.name,
				systemPrompt: parsed.systemPrompt,
				toolNames: parsed.toolNames,
				mcpServerIds: parsed.mcpServerIds,
				isDefault: false
			})
			.returning();
		if (!row) throw new Error('Unable to create agent');

		if (shouldDefault) return serializeAgent(await setAgentAsDefault(userId, row.id, tx));

		await ensureDefaultAgent(userId, tx);
		return serializeAgent((await getAgentRow(userId, row.id, tx)) ?? row);
	});
}

export async function updateAgent(userId: string, id: string, input: AgentInput): Promise<Agent> {
	const parsed = await normalizeAgentInput(input, { create: false });

	return db.transaction(async (tx) => {
		const current = await getAgentRow(userId, id, tx);
		if (!current) throw new Error('Agent not found');
		await ensureUniqueName(userId, parsed.name, id, tx);

		const nextDefault =
			current.isDefault && parsed.isDefault === false ? true : parsed.isDefault;
		if (nextDefault) await clearOtherDefaultAgents(userId, id, tx);
		const [row] = await tx
			.update(agents)
			.set({
				name: parsed.name,
				systemPrompt: parsed.systemPrompt,
				toolNames: parsed.toolNames,
				mcpServerIds: parsed.mcpServerIds,
				...(nextDefault !== undefined ? { isDefault: nextDefault } : {}),
				updatedAt: new Date()
			})
			.where(and(eq(agents.userId, userId), eq(agents.id, id)))
			.returning();
		if (!row) throw new Error('Agent not found');

		await ensureDefaultAgent(userId, tx);
		const updated = await getAgentRow(userId, id, tx);
		if (!updated) throw new Error('Agent not found');
		return serializeAgent(updated);
	});
}

export async function updateAgentDefault(
	userId: string,
	id: string,
	input: AgentDefaultPatchInput
): Promise<Agent> {
	const parsed = agentDefaultPatchSchema.parse(input);

	return db.transaction(async (tx) => {
		const current = await getAgentRow(userId, id, tx);
		if (!current) throw new Error('Agent not found');

		if (parsed.isDefault) return serializeAgent(await setAgentAsDefault(userId, id, tx));

		const [row] = await tx
			.update(agents)
			.set({ isDefault: false, updatedAt: new Date() })
			.where(and(eq(agents.userId, userId), eq(agents.id, id)))
			.returning();
		if (!row) throw new Error('Agent not found');
		const defaultRow = await getDefaultAgentRow(userId, tx);
		if (!defaultRow) await promoteFallbackDefault(userId, tx, id);
		const updated = await getAgentRow(userId, id, tx);
		if (!updated) throw new Error('Agent not found');
		return serializeAgent(updated);
	});
}

export async function deleteAgent(userId: string, id: string): Promise<void> {
	await db.transaction(async (tx) => {
		const current = await getAgentRow(userId, id, tx);
		if (!current) return;

		await deleteAgentRow(id, tx);
		if (current.isDefault) await promoteFallbackDefault(userId, tx);
	});
}
