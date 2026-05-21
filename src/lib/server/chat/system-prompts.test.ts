import { describe, expect, it } from 'vitest';

import {
	defaultSystemPromptPreset,
	orderSystemPromptPresets,
	systemPromptPresetCreateSchema,
	systemPromptPresetPatchSchema
} from './system-prompts';

describe('system prompt presets', () => {
	it('trims preset names while preserving prompt formatting', () => {
		const preset = systemPromptPresetCreateSchema.parse({
			name: '  Research mode  ',
			prompt: '  Keep the opening whitespace.\nUse citations when possible.\n'
		});

		expect(preset).toEqual({
			name: 'Research mode',
			prompt: '  Keep the opening whitespace.\nUse citations when possible.\n'
		});
	});

	it('requires a name and non-blank prompt within limits', () => {
		expect(() => systemPromptPresetCreateSchema.parse({ name: '', prompt: 'Useful prompt' })).toThrow();
		expect(() => systemPromptPresetCreateSchema.parse({ name: 'Useful', prompt: '   ' })).toThrow();
		expect(() =>
			systemPromptPresetCreateSchema.parse({ name: 'x'.repeat(81), prompt: 'Useful prompt' })
		).toThrow();
		expect(() =>
			systemPromptPresetCreateSchema.parse({ name: 'Useful', prompt: 'x'.repeat(20_001) })
		).toThrow();
	});

	it('only accepts default flag patches', () => {
		expect(systemPromptPresetPatchSchema.parse({ isDefault: true })).toEqual({ isDefault: true });
		expect(() => systemPromptPresetPatchSchema.parse({ isDefault: true, name: 'nope' })).toThrow();
	});

	it('finds and orders the default preset first', () => {
		const presets = [
			{ id: '1', name: 'Writer', isDefault: false },
			{ id: '2', name: 'Analyst', isDefault: true },
			{ id: '3', name: 'Coder', isDefault: false }
		];

		expect(defaultSystemPromptPreset(presets)).toEqual(presets[1]);
		expect(orderSystemPromptPresets(presets).map((preset) => preset.name)).toEqual([
			'Analyst',
			'Coder',
			'Writer'
		]);
	});
});
