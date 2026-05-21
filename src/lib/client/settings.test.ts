import { describe, expect, it } from 'vitest';

import {
	defaultModelValue,
	hasModel,
	providerModelOptions,
	supportedProviderFor,
	type SavedProviderOption,
	type SupportedProviderOption
} from './settings';

const supportedProviders: SupportedProviderOption[] = [
	{
		id: 'openai',
		name: 'OpenAI',
		defaultModel: 'gpt-5',
		models: [
			{ id: 'gpt-5', name: 'GPT-5' },
			{ id: 'gpt-5-mini', name: 'GPT-5 Mini' }
		]
	}
];

const baseProvider: SavedProviderOption = {
	id: 'provider-1',
	name: 'Provider',
	providerId: 'openai',
	kind: 'built_in',
	api: 'responses',
	baseUrl: null,
	defaultModel: 'gpt-5',
	models: [],
	favoriteModels: [],
	defaultThinkingLevel: 'medium',
	hasApiKey: true,
	enabled: true,
	isDefault: true,
	authHeader: true
};

describe('settings client helpers', () => {
	it('finds supported providers by id', () => {
		expect(supportedProviderFor(supportedProviders, 'openai')?.name).toBe('OpenAI');
		expect(supportedProviderFor(supportedProviders, 'missing')).toBeUndefined();
	});

	it('uses supported models for built-in saved providers', () => {
		expect(providerModelOptions(baseProvider, supportedProviders)).toEqual(supportedProviders[0].models);
	});

	it('uses saved model ids for custom providers', () => {
		expect(
			providerModelOptions(
				{
					...baseProvider,
					kind: 'custom',
					providerId: 'custom',
					defaultModel: 'local-default',
					models: ['local-a', 'local-b']
				},
				supportedProviders
			)
		).toEqual([
			{ id: 'local-a', name: 'local-a' },
			{ id: 'local-b', name: 'local-b' }
		]);
	});

	it('falls back to the provider default when custom models are empty', () => {
		expect(
			providerModelOptions(
				{ ...baseProvider, kind: 'custom', providerId: 'custom', defaultModel: 'local-default' },
				supportedProviders
			)
		).toEqual([{ id: 'local-default', name: 'local-default' }]);
	});

	it('chooses a valid default model value', () => {
		const options = supportedProviders[0].models;

		expect(hasModel(options, 'gpt-5')).toBe(true);
		expect(defaultModelValue(baseProvider, options)).toBe('gpt-5');
		expect(defaultModelValue({ ...baseProvider, defaultModel: 'legacy' }, options)).toBe('gpt-5');
	});
});
