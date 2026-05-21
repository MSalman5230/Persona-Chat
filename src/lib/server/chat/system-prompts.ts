import { z } from 'zod';

export const SYSTEM_PROMPT_PRESET_NAME_MAX_LENGTH = 80;
export const SYSTEM_PROMPT_PRESET_PROMPT_MAX_LENGTH = 20_000;

export type SystemPromptPreset = {
	id: string;
	name: string;
	prompt: string;
	isDefault: boolean;
	createdAt: Date | string;
	updatedAt: Date | string;
};

export const systemPromptPresetCreateSchema = z
	.object({
		name: z
			.string()
			.trim()
			.min(1, 'Preset name is required')
			.max(SYSTEM_PROMPT_PRESET_NAME_MAX_LENGTH, 'Preset name is too long'),
		prompt: z
			.string()
			.max(SYSTEM_PROMPT_PRESET_PROMPT_MAX_LENGTH, 'System prompt is too long')
			.refine((value) => value.trim().length > 0, 'System prompt is required')
	})
	.strict();

export const systemPromptPresetPatchSchema = z
	.object({
		isDefault: z.boolean()
	})
	.strict();

export function defaultSystemPromptPreset<TPreset extends { isDefault: boolean }>(
	presets: TPreset[]
): TPreset | null {
	return presets.find((preset) => preset.isDefault) ?? null;
}

export function orderSystemPromptPresets<TPreset extends { isDefault: boolean; name: string }>(
	presets: TPreset[]
): TPreset[] {
	return [...presets].sort((a, b) => {
		if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
		return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
	});
}
