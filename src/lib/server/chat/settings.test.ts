import { describe, expect, it } from 'vitest';

import {
	BLANK_SYSTEM_PROMPT_SENTINEL,
	chatSessionSettingsSchema,
	piSystemPromptFromSessionPrompt,
	providerSystemPromptFromPi,
	streamOptionsWithTemperature
} from './settings';

describe('chat session settings', () => {
	it('accepts a blank custom instruction and automatic temperature', () => {
		expect(
			chatSessionSettingsSchema.parse({
				customInstruction: '',
				temperature: null
			})
		).toEqual({
			customInstruction: '',
			temperature: null
		});
	});

	it('accepts finite temperatures in range', () => {
		expect(
			chatSessionSettingsSchema.parse({
				customInstruction: 'Answer tersely.',
				temperature: 1.2
			}).temperature
		).toBe(1.2);
	});

	it('rejects invalid temperatures', () => {
		expect(() =>
			chatSessionSettingsSchema.parse({
				customInstruction: '',
				temperature: -0.1
			})
		).toThrow();
		expect(() =>
			chatSessionSettingsSchema.parse({
				customInstruction: '',
				temperature: 2.1
			})
		).toThrow();
		expect(() =>
			chatSessionSettingsSchema.parse({
				customInstruction: '',
				temperature: Number.NaN
			})
		).toThrow();
	});

	it('uses an internal sentinel for blank PI prompts and strips it before providers', () => {
		expect(piSystemPromptFromSessionPrompt('')).toBe(BLANK_SYSTEM_PROMPT_SENTINEL);
		expect(providerSystemPromptFromPi(BLANK_SYSTEM_PROMPT_SENTINEL)).toBe('');
		expect(providerSystemPromptFromPi('Exact prompt')).toBe('Exact prompt');
	});

	it('omits temperature options while automatic and injects explicit values', () => {
		const autoOptions = { maxTokens: 100 };
		expect(streamOptionsWithTemperature(autoOptions, null)).toBe(autoOptions);
		expect(streamOptionsWithTemperature({ maxTokens: 100, temperature: 1 }, null)).toEqual({
			maxTokens: 100
		});
		expect(streamOptionsWithTemperature(autoOptions, 0)).toEqual({
			maxTokens: 100,
			temperature: 0
		});
	});
});
