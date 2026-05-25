import { z } from 'zod';

export const TEMPERATURE_MIN = 0;
export const TEMPERATURE_MAX = 2;
export const DEFAULT_MANUAL_TEMPERATURE = 0.7;
export const BLANK_SYSTEM_PROMPT_SENTINEL = '__persona_internal_blank_system_prompt__';

export const temperatureSchema = z.number().finite().min(TEMPERATURE_MIN).max(TEMPERATURE_MAX).nullable();
export const nullableAgentIdSchema = z.string().uuid().nullable();

export const chatSessionSettingsSchema = z
	.object({
		agentId: nullableAgentIdSchema.optional(),
		temperature: temperatureSchema
	})
	.strict();

export const chatSessionSettingsPatchSchema = chatSessionSettingsSchema.partial().refine(
	(value) =>
		value.agentId !== undefined ||
		value.temperature !== undefined,
	{ message: 'At least one session setting is required' }
);

export type ChatSessionSettings = z.infer<typeof chatSessionSettingsSchema>;

export function piSystemPromptFromSessionPrompt(systemPrompt: string): string {
	return systemPrompt.length > 0 ? systemPrompt : BLANK_SYSTEM_PROMPT_SENTINEL;
}

export function providerSystemPromptFromPi(systemPrompt: string | undefined): string | undefined {
	if (systemPrompt === BLANK_SYSTEM_PROMPT_SENTINEL) return '';
	return systemPrompt;
}

export function streamOptionsWithTemperature<TOptions extends object>(
	options: TOptions | undefined,
	temperature: number | null
): TOptions | (Omit<TOptions, 'temperature'> & { temperature: number }) | undefined {
	if (temperature === null) {
		if (!options || !('temperature' in options)) return options;

		const { temperature: _temperature, ...rest } = options as TOptions & {
			temperature?: unknown;
		};
		return rest as TOptions;
	}

	const { temperature: _temperature, ...rest } = (options ?? {}) as TOptions & {
		temperature?: unknown;
	};
	return { ...rest, temperature };
}
