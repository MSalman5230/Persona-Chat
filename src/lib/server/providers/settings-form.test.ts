import { describe, expect, it } from 'vitest';

import { getSupportedProviders } from './catalog';
import { builtInProviderPayloadFromForm } from './settings-form';

function formFromEntries(entries: Record<string, string | undefined>): FormData {
	const form = new FormData();
	for (const [key, value] of Object.entries(entries)) {
		if (value !== undefined) form.set(key, value);
	}
	return form;
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
