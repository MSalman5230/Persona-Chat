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
import { listMcpServers } from './mcp';

export type AgentRow = typeof agents.$inferSelect;

const appToolNames = appTools.map((tool) => tool.name);
const appToolNameSet = new Set(appToolNames);

function serializeAgent(row: AgentRow): Agent {
	return {
		...row,
		toolNames: row.toolNames.filter((name) => appToolNameSet.has(name)),
		mcpServerIds: row.mcpServerIds
	};
}

function defaultToolNames(toolNames: string[] | undefined): string[] {
	return toolNames === undefined ? appToolNames : toolNames;
}

async function normalizeMcpServerIds(ids: string[]): Promise<string[]> {
	const allowed = new Set((await listMcpServers()).map((server) => server.id));
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

async function hasAnyAgents(): Promise<boolean> {
	const rows = await db.select({ id: agents.id }).from(agents).limit(1);
	return rows.length > 0;
}

async function ensureUniqueName(name: string, existingId?: string): Promise<void> {
	const rows = await db.select({ id: agents.id }).from(agents).where(eq(agents.name, name)).limit(1);
	if (rows.length > 0 && rows[0].id !== existingId) throw new Error(duplicateNameMessage(name));
}

async function clearOtherDefaultAgents(id: string): Promise<void> {
	await db
		.update(agents)
		.set({ isDefault: false, updatedAt: new Date() })
		.where(and(eq(agents.isDefault, true), ne(agents.id, id)));
}

async function promoteFallbackDefault(): Promise<void> {
	const [fallback] = await db.select().from(agents).orderBy(asc(agents.createdAt)).limit(1);
	if (!fallback) return;
	await db
		.update(agents)
		.set({ isDefault: true, updatedAt: new Date() })
		.where(eq(agents.id, fallback.id));
}

export function listAvailableAgentTools(): AgentToolOption[] {
	return appTools.map((tool) => ({
		name: tool.name,
		label: tool.label,
		description: tool.description
	}));
}

export async function listAgents(): Promise<Agent[]> {
	const rows = await db.select().from(agents);
	return orderAgents(rows.map(serializeAgent));
}

export async function listAgentOptions(): Promise<AgentOption[]> {
	const rows = await db
		.select({
			id: agents.id,
			name: agents.name,
			isDefault: agents.isDefault
		})
		.from(agents);
	return orderAgents(rows);
}

export async function getAgent(id: string): Promise<Agent | undefined> {
	const [row] = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
	return row ? serializeAgent(row) : undefined;
}

export async function getDefaultAgent(): Promise<Agent | null> {
	const [row] = await db.select().from(agents).where(eq(agents.isDefault, true)).limit(1);
	return row ? serializeAgent(row) : null;
}

export async function createAgent(input: AgentInput): Promise<Agent> {
	const hadAgents = await hasAnyAgents();
	const parsed = await normalizeAgentInput(input, { create: true });
	await ensureUniqueName(parsed.name);

	const shouldDefault = parsed.isDefault ?? !hadAgents;
	const [row] = await db
		.insert(agents)
		.values({
			name: parsed.name,
			systemPrompt: parsed.systemPrompt,
			toolNames: parsed.toolNames,
			mcpServerIds: parsed.mcpServerIds,
			isDefault: shouldDefault
		})
		.returning();

	if (shouldDefault) await clearOtherDefaultAgents(row.id);
	return serializeAgent(row);
}

export async function updateAgent(id: string, input: AgentInput): Promise<Agent> {
	const current = await getAgent(id);
	if (!current) throw new Error('Agent not found');

	const parsed = await normalizeAgentInput(input, { create: false });
	await ensureUniqueName(parsed.name, id);

	if (parsed.isDefault) await clearOtherDefaultAgents(id);
	const [row] = await db
		.update(agents)
		.set({
			name: parsed.name,
			systemPrompt: parsed.systemPrompt,
			toolNames: parsed.toolNames,
			mcpServerIds: parsed.mcpServerIds,
			...(parsed.isDefault !== undefined ? { isDefault: parsed.isDefault } : {}),
			updatedAt: new Date()
		})
		.where(eq(agents.id, id))
		.returning();

	return serializeAgent(row);
}

export async function updateAgentDefault(
	id: string,
	input: AgentDefaultPatchInput
): Promise<Agent> {
	const current = await getAgent(id);
	if (!current) throw new Error('Agent not found');

	const parsed = agentDefaultPatchSchema.parse(input);
	if (parsed.isDefault) await clearOtherDefaultAgents(id);
	const [row] = await db
		.update(agents)
		.set({ isDefault: parsed.isDefault, updatedAt: new Date() })
		.where(eq(agents.id, id))
		.returning();

	if (!parsed.isDefault) {
		const defaultRow = await getDefaultAgent();
		if (!defaultRow) await promoteFallbackDefault();
	}

	return serializeAgent(row);
}

export async function deleteAgent(id: string): Promise<void> {
	const current = await getAgent(id);
	if (!current) return;

	await db.delete(agents).where(eq(agents.id, id));
	if (current.isDefault) await promoteFallbackDefault();
}
