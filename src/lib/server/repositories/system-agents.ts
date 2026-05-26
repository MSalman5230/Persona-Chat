import { and, eq } from 'drizzle-orm';

import { db } from '$lib/server/db';
import { systemAgents } from '$lib/server/db/schema';
import {
	PREBUILT_GENERAL_AGENT_ID,
	PREBUILT_GENERAL_AGENT_SLUG
} from '$lib/shared/prebuilt-general-agent';

export type SystemAgentRow = typeof systemAgents.$inferSelect;

type SystemAgentDatabase = Pick<typeof db, 'select'>;

async function getActiveSystemAgentBySlug(
	slug: string,
	database: SystemAgentDatabase = db
): Promise<SystemAgentRow | undefined> {
	const [row] = await database
		.select()
		.from(systemAgents)
		.where(and(eq(systemAgents.slug, slug), eq(systemAgents.isActive, true)))
		.limit(1);
	return row;
}

export async function getSystemAgentByName(
	name: string,
	database: SystemAgentDatabase = db
): Promise<SystemAgentRow | undefined> {
	const [row] = await database
		.select()
		.from(systemAgents)
		.where(and(eq(systemAgents.name, name), eq(systemAgents.isActive, true)))
		.limit(1);
	return row;
}

export async function getPrebuiltGeneralAgentRow(
	database: SystemAgentDatabase = db
): Promise<SystemAgentRow> {
	const row = await getActiveSystemAgentBySlug(PREBUILT_GENERAL_AGENT_SLUG, database);
	if (!row) throw new Error(`System agent seed is missing: ${PREBUILT_GENERAL_AGENT_SLUG}`);
	if (row.id !== PREBUILT_GENERAL_AGENT_ID) {
		throw new Error(`System agent seed has an unexpected id: ${PREBUILT_GENERAL_AGENT_SLUG}`);
	}
	return row;
}
