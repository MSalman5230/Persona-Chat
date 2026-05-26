import { and, eq, ne } from 'drizzle-orm';

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
import {
	isPrebuiltGeneralAgentId,
	normalizePrebuiltGeneralAgentId
} from '$lib/shared/prebuilt-general-agent';
import { listEnabledMcpServerOptions } from './mcp';
import {
	getPrebuiltGeneralAgentRow,
	getSystemAgentByName,
	type SystemAgentRow
} from './system-agents';

export type AgentRow = typeof agents.$inferSelect;
type AgentDatabase = Pick<typeof db, 'delete' | 'insert' | 'select' | 'update'>;

const appToolNames = appTools.map((tool) => tool.name);
const appToolNameSet = new Set(appToolNames);

function serializeAgent(row: AgentRow): Agent {
	const { userId: _userId, ...publicRow } = row;
	return {
		...publicRow,
		toolNames: row.toolNames.filter((name) => appToolNameSet.has(name)),
		mcpServerIds: row.mcpServerIds,
		toolAccess: 'selected',
		mcpServerAccess: 'selected',
		isPrebuilt: false,
		toolsLocked: false,
		mcpServersLocked: false
	};
}

function serializePrebuiltGeneralAgent(row: SystemAgentRow, isDefault: boolean): Agent {
	return {
		id: row.id,
		name: row.name,
		systemPrompt: row.systemPrompt,
		toolNames: [],
		mcpServerIds: [],
		toolAccess: 'all',
		mcpServerAccess: 'all',
		isDefault,
		isPrebuilt: true,
		toolsLocked: true,
		mcpServersLocked: true,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt
	};
}

function prebuiltGeneralAgentOption(row: SystemAgentRow, isDefault: boolean): AgentOption {
	return {
		id: row.id,
		name: row.name,
		isDefault,
		isPrebuilt: true
	};
}

function defaultToolNames(toolNames: string[] | undefined): string[] {
	return toolNames === undefined ? appToolNames : toolNames;
}

async function normalizeMcpServerIds(ids: string[]): Promise<string[]> {
	const uniqueIds = uniqueStrings(ids);
	if (uniqueIds.length === 0) return [];
	const allowed = new Set((await listEnabledMcpServerOptions()).map((server) => server.id));
	return uniqueIds.filter((id) => allowed.has(id));
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

async function insertNormalizedAgent(
	userId: string,
	parsed: Awaited<ReturnType<typeof normalizeAgentInput>>
): Promise<Agent> {
	return db.transaction(async (tx) => {
		await ensureUniqueName(userId, parsed.name, undefined, tx);
		const shouldDefault = parsed.isDefault ?? false;
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

		return serializeAgent((await getAgentRow(userId, row.id, tx)) ?? row);
	});
}

function duplicateNameMessage(name: string): string {
	return `An agent named "${name}" already exists`;
}

async function ensureUniqueName(
	userId: string,
	name: string,
	existingId?: string,
	database: AgentDatabase = db
): Promise<void> {
	if (await getSystemAgentByName(name, database)) throw new Error(duplicateNameMessage(name));
	const rows = await database
		.select({ id: agents.id })
		.from(agents)
		.where(and(eq(agents.userId, userId), eq(agents.name, name)))
		.limit(1);
	if (rows.length > 0 && rows[0].id !== existingId) throw new Error(duplicateNameMessage(name));
}

async function uniquePrebuiltGeneralAgentCopyName(
	userId: string,
	systemAgentName: string,
	database: AgentDatabase = db
): Promise<string> {
	const baseName = `${systemAgentName} Copy`;

	for (let index = 0; index < 100; index += 1) {
		const name = index === 0 ? baseName : `${baseName} ${index + 1}`;
		const rows = await database
			.select({ id: agents.id })
			.from(agents)
			.where(and(eq(agents.userId, userId), eq(agents.name, name)))
			.limit(1);
		if (rows.length === 0) return name;
	}

	throw new Error('Unable to create a unique Prebuilt General Agent copy name');
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

async function clearDefaultAgents(userId: string, database: AgentDatabase = db): Promise<void> {
	await database
		.update(agents)
		.set({ isDefault: false, updatedAt: new Date() })
		.where(and(eq(agents.userId, userId), eq(agents.isDefault, true)));
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

async function deleteAgentRow(
	userId: string,
	id: string,
	database: AgentDatabase = db
): Promise<void> {
	await database.delete(agents).where(and(eq(agents.userId, userId), eq(agents.id, id)));
}

export function listAvailableAgentTools(): AgentToolOption[] {
	return appTools.map((tool) => ({
		name: tool.name,
		label: tool.label,
		description: tool.description
	}));
}

export async function listAgents(userId: string): Promise<Agent[]> {
	const [rows, prebuiltRow] = await Promise.all([
		db.select().from(agents).where(eq(agents.userId, userId)),
		getPrebuiltGeneralAgentRow()
	]);
	const userAgents = rows.map(serializeAgent);
	const hasUserDefault = userAgents.some((agent) => agent.isDefault);
	return orderAgents([serializePrebuiltGeneralAgent(prebuiltRow, !hasUserDefault), ...userAgents]);
}

export async function listAgentOptions(userId: string): Promise<AgentOption[]> {
	const [rows, prebuiltRow] = await Promise.all([
		db
			.select({
				id: agents.id,
				name: agents.name,
				isDefault: agents.isDefault
			})
			.from(agents)
			.where(eq(agents.userId, userId)),
		getPrebuiltGeneralAgentRow()
	]);
	const userAgents = rows.map((row) => ({
		id: row.id,
		name: row.name,
		isDefault: row.isDefault,
		isPrebuilt: false
	}));
	const hasUserDefault = userAgents.some((agent) => agent.isDefault);
	return orderAgents([prebuiltGeneralAgentOption(prebuiltRow, !hasUserDefault), ...userAgents]);
}

export async function getAgent(userId: string, id: string): Promise<Agent | undefined> {
	if (isPrebuiltGeneralAgentId(id)) {
		return serializePrebuiltGeneralAgent(await getPrebuiltGeneralAgentRow(), false);
	}
	const row = await getAgentRow(userId, id);
	return row ? serializeAgent(row) : undefined;
}

export async function getDefaultAgent(userId: string): Promise<Agent | null> {
	const row = await getDefaultAgentRow(userId);
	return row
		? serializeAgent(row)
		: serializePrebuiltGeneralAgent(await getPrebuiltGeneralAgentRow(), true);
}

export async function resolveAgentSelection(
	userId: string,
	id: string | null | undefined
): Promise<Agent | undefined> {
	if (!id || isPrebuiltGeneralAgentId(id)) {
		return serializePrebuiltGeneralAgent(await getPrebuiltGeneralAgentRow(), false);
	}
	return getAgent(userId, id);
}

export async function createAgent(userId: string, input: AgentInput): Promise<Agent> {
	const parsed = await normalizeAgentInput(input, { create: true });
	return insertNormalizedAgent(userId, parsed);
}

export async function updateAgent(
	userId: string,
	id: string,
	input: AgentInput
): Promise<Agent> {
	if (isPrebuiltGeneralAgentId(id)) throw new Error('Prebuilt General Agent cannot be edited');
	const parsed = await normalizeAgentInput(input, { create: false });

	return db.transaction(async (tx) => {
		const current = await getAgentRow(userId, id, tx);
		if (!current) throw new Error('Agent not found');
		await ensureUniqueName(userId, parsed.name, id, tx);

		const nextDefault = parsed.isDefault;
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
		if (isPrebuiltGeneralAgentId(id)) {
			const prebuiltRow = await getPrebuiltGeneralAgentRow(tx);
			if (parsed.isDefault) await clearDefaultAgents(userId, tx);
			const defaultRow = await getDefaultAgentRow(userId, tx);
			return serializePrebuiltGeneralAgent(prebuiltRow, !defaultRow);
		}

		const current = await getAgentRow(userId, id, tx);
		if (!current) throw new Error('Agent not found');

		if (parsed.isDefault) return serializeAgent(await setAgentAsDefault(userId, id, tx));

		const [row] = await tx
			.update(agents)
			.set({ isDefault: false, updatedAt: new Date() })
			.where(and(eq(agents.userId, userId), eq(agents.id, id)))
			.returning();
		if (!row) throw new Error('Agent not found');
		const updated = await getAgentRow(userId, id, tx);
		if (!updated) throw new Error('Agent not found');
		return serializeAgent(updated);
	});
}

export async function deleteAgent(userId: string, id: string): Promise<void> {
	if (isPrebuiltGeneralAgentId(id)) throw new Error('Prebuilt General Agent cannot be deleted');
	await db.transaction(async (tx) => {
		const current = await getAgentRow(userId, id, tx);
		if (!current) return;

		await deleteAgentRow(userId, id, tx);
	});
}

export async function clonePrebuiltGeneralAgent(userId: string): Promise<Agent> {
	const prebuiltRow = await getPrebuiltGeneralAgentRow();
	const name = await uniquePrebuiltGeneralAgentCopyName(userId, prebuiltRow.name);
	const mcpServerIds = (await listEnabledMcpServerOptions()).map((server) => server.id);
	return insertNormalizedAgent(userId, {
		name,
		systemPrompt: prebuiltRow.systemPrompt,
		toolNames: appToolNames,
		mcpServerIds,
		isDefault: false
	});
}

export { normalizePrebuiltGeneralAgentId as normalizeAgentIdForStorage };
