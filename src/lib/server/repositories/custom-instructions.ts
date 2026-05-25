import { and, eq, ne } from 'drizzle-orm';
import { z } from 'zod';

import {
	customInstructionPresetCreateSchema,
	customInstructionPresetPatchSchema,
	orderCustomInstructionPresets,
	type CustomInstructionPreset
} from '$lib/server/chat/custom-instructions';
import { db } from '$lib/server/db';
import { customInstructionPresets } from '$lib/server/db/schema';

export type CustomInstructionPresetRow = typeof customInstructionPresets.$inferSelect;
export type CustomInstructionPresetCreateInput = z.input<
	typeof customInstructionPresetCreateSchema
>;
export type CustomInstructionPresetPatchInput = z.input<typeof customInstructionPresetPatchSchema>;

function serializeCustomInstructionPreset(
	row: CustomInstructionPresetRow
): CustomInstructionPreset {
	return row;
}

function duplicateNameMessage(name: string): string {
	return `A custom instruction preset named "${name}" already exists`;
}

export async function listCustomInstructionPresets(): Promise<CustomInstructionPreset[]> {
	const rows = await db.select().from(customInstructionPresets);
	return orderCustomInstructionPresets(rows.map(serializeCustomInstructionPreset));
}

async function getCustomInstructionPreset(
	id: string
): Promise<CustomInstructionPresetRow | undefined> {
	const [row] = await db
		.select()
		.from(customInstructionPresets)
		.where(eq(customInstructionPresets.id, id))
		.limit(1);
	return row;
}

export async function createCustomInstructionPreset(
	input: CustomInstructionPresetCreateInput
): Promise<CustomInstructionPreset> {
	const parsed = customInstructionPresetCreateSchema.parse(input);
	const existing = await db
		.select({ id: customInstructionPresets.id })
		.from(customInstructionPresets)
		.where(eq(customInstructionPresets.name, parsed.name))
		.limit(1);
	if (existing.length > 0) throw new Error(duplicateNameMessage(parsed.name));

	const [row] = await db
		.insert(customInstructionPresets)
		.values({
			name: parsed.name,
			instruction: parsed.instruction,
			isDefault: false
		})
		.returning();
	return serializeCustomInstructionPreset(row);
}

export async function updateCustomInstructionPresetDefault(
	id: string,
	input: CustomInstructionPresetPatchInput
): Promise<CustomInstructionPreset> {
	const current = await getCustomInstructionPreset(id);
	if (!current) throw new Error('Custom instruction preset not found');

	const parsed = customInstructionPresetPatchSchema.parse(input);
	if (parsed.isDefault) {
		await db
			.update(customInstructionPresets)
			.set({ isDefault: false, updatedAt: new Date() })
			.where(
				and(eq(customInstructionPresets.isDefault, true), ne(customInstructionPresets.id, id))
			);
	}

	const [row] = await db
		.update(customInstructionPresets)
		.set({ isDefault: parsed.isDefault, updatedAt: new Date() })
		.where(eq(customInstructionPresets.id, id))
		.returning();
	return serializeCustomInstructionPreset(row);
}

export async function deleteCustomInstructionPreset(id: string): Promise<void> {
	await db.delete(customInstructionPresets).where(eq(customInstructionPresets.id, id));
}
