import { describe, expect, it } from 'vitest';

import {
	customInstructionPresetCreateSchema,
	customInstructionPresetPatchSchema,
	defaultCustomInstructionPreset,
	orderCustomInstructionPresets
} from './custom-instructions';

describe('custom instruction presets', () => {
	it('trims preset names while preserving instruction formatting', () => {
		const preset = customInstructionPresetCreateSchema.parse({
			name: '  Research mode  ',
			instruction: '  Keep the opening whitespace.\nUse citations when possible.\n'
		});

		expect(preset).toEqual({
			name: 'Research mode',
			instruction: '  Keep the opening whitespace.\nUse citations when possible.\n'
		});
	});

	it('requires a name and non-blank instruction within limits', () => {
		expect(() =>
			customInstructionPresetCreateSchema.parse({ name: '', instruction: 'Useful prompt' })
		).toThrow();
		expect(() =>
			customInstructionPresetCreateSchema.parse({ name: 'Useful', instruction: '   ' })
		).toThrow();
		expect(() =>
			customInstructionPresetCreateSchema.parse({
				name: 'x'.repeat(81),
				instruction: 'Useful prompt'
			})
		).toThrow();
		expect(() =>
			customInstructionPresetCreateSchema.parse({ name: 'Useful', instruction: 'x'.repeat(20_001) })
		).toThrow();
	});

	it('only accepts default flag patches', () => {
		expect(customInstructionPresetPatchSchema.parse({ isDefault: true })).toEqual({
			isDefault: true
		});
		expect(() =>
			customInstructionPresetPatchSchema.parse({ isDefault: true, name: 'nope' })
		).toThrow();
	});

	it('finds and orders the default preset first', () => {
		const presets = [
			{ id: '1', name: 'Writer', isDefault: false },
			{ id: '2', name: 'Analyst', isDefault: true },
			{ id: '3', name: 'Coder', isDefault: false }
		];

		expect(defaultCustomInstructionPreset(presets)).toEqual(presets[1]);
		expect(orderCustomInstructionPresets(presets).map((preset) => preset.name)).toEqual([
			'Analyst',
			'Coder',
			'Writer'
		]);
	});
});
