import { and, eq, ne } from 'drizzle-orm';
import { z } from 'zod';

import {
	defaultSystemPromptPreset,
	orderSystemPromptPresets,
	systemPromptPresetCreateSchema,
	systemPromptPresetPatchSchema,
	type SystemPromptPreset
} from '$lib/server/chat/system-prompts';
import { db } from '$lib/server/db';
import { systemPromptPresets } from '$lib/server/db/schema';

export type SystemPromptPresetRow = typeof systemPromptPresets.$inferSelect;
export type SystemPromptPresetCreateInput = z.input<typeof systemPromptPresetCreateSchema>;
export type SystemPromptPresetPatchInput = z.input<typeof systemPromptPresetPatchSchema>;

function serializeSystemPromptPreset(row: SystemPromptPresetRow): SystemPromptPreset {
	return row;
}

function duplicateNameMessage(name: string): string {
	return `A system prompt preset named "${name}" already exists`;
}

export async function listSystemPromptPresets(): Promise<SystemPromptPreset[]> {
	const rows = await db.select().from(systemPromptPresets);
	return orderSystemPromptPresets(rows.map(serializeSystemPromptPreset));
}

export async function getSystemPromptPreset(id: string): Promise<SystemPromptPresetRow | undefined> {
	const [row] = await db
		.select()
		.from(systemPromptPresets)
		.where(eq(systemPromptPresets.id, id))
		.limit(1);
	return row;
}

export async function getDefaultSystemPromptPreset(): Promise<SystemPromptPreset | null> {
	return defaultSystemPromptPreset(await listSystemPromptPresets());
}

export async function createSystemPromptPreset(
	input: SystemPromptPresetCreateInput
): Promise<SystemPromptPreset> {
	const parsed = systemPromptPresetCreateSchema.parse(input);
	const existing = await db
		.select({ id: systemPromptPresets.id })
		.from(systemPromptPresets)
		.where(eq(systemPromptPresets.name, parsed.name))
		.limit(1);
	if (existing.length > 0) throw new Error(duplicateNameMessage(parsed.name));

	const [row] = await db
		.insert(systemPromptPresets)
		.values({
			name: parsed.name,
			prompt: parsed.prompt,
			isDefault: false
		})
		.returning();
	return serializeSystemPromptPreset(row);
}

export async function updateSystemPromptPresetDefault(
	id: string,
	input: SystemPromptPresetPatchInput
): Promise<SystemPromptPreset> {
	const current = await getSystemPromptPreset(id);
	if (!current) throw new Error('System prompt preset not found');

	const parsed = systemPromptPresetPatchSchema.parse(input);
	if (parsed.isDefault) {
		await db
			.update(systemPromptPresets)
			.set({ isDefault: false, updatedAt: new Date() })
			.where(and(eq(systemPromptPresets.isDefault, true), ne(systemPromptPresets.id, id)));
	}

	const [row] = await db
		.update(systemPromptPresets)
		.set({ isDefault: parsed.isDefault, updatedAt: new Date() })
		.where(eq(systemPromptPresets.id, id))
		.returning();
	return serializeSystemPromptPreset(row);
}

export async function deleteSystemPromptPreset(id: string): Promise<void> {
	await db.delete(systemPromptPresets).where(eq(systemPromptPresets.id, id));
}
