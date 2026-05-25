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
	provider: {
		id: 'provider-1',
		name: 'Provider',
		providerId: 'openai',
		api: 'responses',
		baseUrl: null,
		defaultModel: 'gpt-5',
		models: [],
		favoriteModels: [],
		config: {},
		defaultThinkingLevel: 'medium',
		hasApiKey: true,
		hasHeaders: false,
		secretPreview: '••••',
		enabled: true,
		isDefault: true,
		authHeader: true,
		createdAt: new Date('2026-05-25T00:00:00.000Z'),
		updatedAt: new Date('2026-05-25T00:00:00.000Z')
	},
	preference: null,
	effective: {
		defaultModel: 'gpt-5',
		favoriteModels: [],
		isDefault: true
	}
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
					provider: {
						...baseProvider.provider,
						providerId: 'custom',
						baseUrl: 'http://localhost:1234/v1',
						defaultModel: 'local-default',
						models: ['local-a', 'local-b']
					},
					effective: { ...baseProvider.effective, defaultModel: 'local-default' }
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
				{
					...baseProvider,
					provider: {
						...baseProvider.provider,
						providerId: 'custom',
						baseUrl: 'http://localhost:1234/v1',
						defaultModel: 'local-default'
					},
					effective: { ...baseProvider.effective, defaultModel: 'local-default' }
				},
				supportedProviders
			)
		).toEqual([{ id: 'local-default', name: 'local-default' }]);
	});

	it('uses saved model ids when a supported provider has a custom base URL', () => {
		expect(
			providerModelOptions(
				{
					...baseProvider,
					provider: {
						...baseProvider.provider,
						baseUrl: 'https://proxy.example.test/v1',
						defaultModel: 'proxy-model',
						models: ['proxy-model']
					},
					effective: { ...baseProvider.effective, defaultModel: 'proxy-model' }
				},
				supportedProviders
			)
		).toEqual([{ id: 'proxy-model', name: 'proxy-model' }]);
	});

	it('chooses a valid default model value', () => {
		const options = supportedProviders[0].models;

		expect(hasModel(options, 'gpt-5')).toBe(true);
		expect(defaultModelValue(baseProvider, options)).toBe('gpt-5');
		expect(
			defaultModelValue(
				{ ...baseProvider, effective: { ...baseProvider.effective, defaultModel: 'legacy' } },
				options
			)
		).toBe('gpt-5');
	});
});
