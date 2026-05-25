import { z } from 'zod';

export const CUSTOM_INSTRUCTION_PRESET_NAME_MAX_LENGTH = 80;
export const CUSTOM_INSTRUCTION_PRESET_TEXT_MAX_LENGTH = 20_000;

export type CustomInstructionPreset = {
	id: string;
	name: string;
	instruction: string;
	isDefault: boolean;
	createdAt: Date | string;
	updatedAt: Date | string;
};

export const customInstructionPresetCreateSchema = z
	.object({
		name: z
			.string()
			.trim()
			.min(1, 'Preset name is required')
			.max(CUSTOM_INSTRUCTION_PRESET_NAME_MAX_LENGTH, 'Preset name is too long'),
		instruction: z
			.string()
			.max(CUSTOM_INSTRUCTION_PRESET_TEXT_MAX_LENGTH, 'Custom instruction is too long')
			.refine((value) => value.trim().length > 0, 'Custom instruction is required')
	})
	.strict();

export const customInstructionPresetPatchSchema = z
	.object({
		isDefault: z.boolean()
	})
	.strict();

export function defaultCustomInstructionPreset<TPreset extends { isDefault: boolean }>(
	presets: TPreset[]
): TPreset | null {
	return presets.find((preset) => preset.isDefault) ?? null;
}

export function orderCustomInstructionPresets<TPreset extends { isDefault: boolean; name: string }>(
	presets: TPreset[]
): TPreset[] {
	return [...presets].sort((a, b) => {
		if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
		return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
	});
}
