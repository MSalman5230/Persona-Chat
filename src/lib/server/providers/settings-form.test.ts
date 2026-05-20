import { describe, expect, it } from 'vitest';

import { getSupportedProviders } from './catalog';
import { builtInProviderPayloadFromForm, providerPayloadFromForm } from './settings-form';

function formFromEntries(entries: Record<string, string | undefined>): FormData {
	const form = new FormData();
	for (const [key, value] of Object.entries(entries)) {
		if (value !== undefined) form.set(key, value);
	}
	return form;
}

function formFromPairs(entries: Array<[string, string | undefined]>): FormData {
	const form = new FormData();
	for (const [key, value] of entries) {
		if (value !== undefined) form.append(key, value);
	}
	return form;
}

function providerWithModels(count: number) {
	const provider = getSupportedProviders().find((item) => item.models.length >= count);
	if (!provider) throw new Error(`Expected a supported provider with at least ${count} models`);
	return provider;
}

describe('provider settings form helper', () => {
	it('creates a derived built-in provider payload', () => {
		const [provider] = getSupportedProviders();
		const model = provider.models[0];

		const payload = builtInProviderPayloadFromForm(
			formFromEntries({
				providerId: provider.id,
				defaultModel: model.id,
				defaultThinkingLevel: 'high',
				apiKey: 'sk-test',
				enabled: 'on',
				isDefault: 'on'
			}),
			false
		);

		expect(payload).toMatchObject({
			name: provider.name,
			providerId: provider.id,
			kind: 'built_in',
			api: model.api,
			baseUrl: null,
			defaultModel: model.id,
			defaultThinkingLevel: 'high',
			apiKey: 'sk-test',
			enabled: true,
			isDefault: true
		});
		expect(payload.models).toEqual(provider.models.map((item) => item.id));
		expect(payload.favoriteModels).toEqual([]);
	});

	it('ignores tampered registry-controlled fields', () => {
		const [provider] = getSupportedProviders();
		const model = provider.models[0];

		const payload = builtInProviderPayloadFromForm(
			formFromEntries({
				name: 'Tampered',
				providerId: provider.id,
				kind: 'built_in',
				api: 'tampered-api',
				baseUrl: 'https://tampered.example.test',
				models: 'tampered-model',
				defaultModel: model.id
			}),
			false
		);

		expect(payload.name).toBe(provider.name);
		expect(payload.kind).toBe('built_in');
		expect(payload.api).toBe(model.api);
		expect(payload.baseUrl).toBeNull();
		expect(payload.models).toEqual(provider.models.map((item) => item.id));
	});

	it('keeps only supported built-in favorite models', () => {
		const provider = providerWithModels(3);
		const [defaultModel, favoriteModel, secondFavorite] = provider.models;

		const payload = builtInProviderPayloadFromForm(
			formFromPairs([
				['providerId', provider.id],
				['defaultModel', defaultModel.id],
				['favoriteModels', favoriteModel.id],
				['favoriteModels', 'not-a-real-model'],
				['favoriteModels', favoriteModel.id],
				['favoriteModels', secondFavorite.id]
			]),
			false
		);

		expect(payload.favoriteModels).toEqual([favoriteModel.id, secondFavorite.id]);
	});

	it('does not auto-favorite the default model', () => {
		const provider = providerWithModels(2);
		const [, defaultModel] = provider.models;

		const payload = builtInProviderPayloadFromForm(
			formFromEntries({
				providerId: provider.id,
				defaultModel: defaultModel.id
			}),
			false
		);

		expect(payload.defaultModel).toBe(defaultModel.id);
		expect(payload.favoriteModels).toEqual([]);
	});

	it('keeps only configured custom favorite models', () => {
		const payload = providerPayloadFromForm(
			formFromPairs([
				['name', 'Local OpenAI compatible'],
				['providerId', 'local-openai'],
				['kind', 'custom'],
				['api', 'openai-completions'],
				['baseUrl', 'http://localhost:1234/v1'],
				['defaultModel', 'local-small'],
				['models', 'local-small\nlocal-large\nlocal-huge'],
				['favoriteModels', 'local-large'],
				['favoriteModels', 'not-configured'],
				['favoriteModels', 'local-huge']
			]),
			{ update: true, existingKind: 'custom' }
		);

		expect(payload.models).toEqual(['local-small', 'local-large', 'local-huge']);
		expect(payload.favoriteModels).toEqual(['local-large', 'local-huge']);
	});

	it('rejects unknown provider IDs', () => {
		expect(() =>
			builtInProviderPayloadFromForm(
				formFromEntries({
					providerId: 'not-a-real-provider',
					defaultModel: 'not-a-real-model'
				}),
				false
			)
		).toThrow(/not supported/);
	});

	it('rejects the create custom provider path', () => {
		const [provider] = getSupportedProviders();

		expect(() =>
			builtInProviderPayloadFromForm(
				formFromEntries({
					kind: 'custom',
					providerId: provider.id,
					defaultModel: provider.defaultModel
				}),
				false
			)
		).toThrow(/Custom providers cannot be created/);
	});
});
