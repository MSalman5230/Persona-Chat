import { getProviders } from '@earendil-works/pi-ai';
import { describe, expect, it } from 'vitest';

import { getSupportedProviders } from './catalog';

describe('provider catalog', () => {
	it('includes every PI SDK provider exactly once', () => {
		const providerIds = getSupportedProviders().map((provider) => provider.id);
		const sdkProviderIds = [...getProviders()];

		expect(new Set(providerIds).size).toBe(providerIds.length);
		expect(providerIds.toSorted()).toEqual(sdkProviderIds.toSorted());
	});

	it('includes at least one model for every provider', () => {
		for (const provider of getSupportedProviders()) {
			expect(provider.models.length, provider.id).toBeGreaterThan(0);
		}
	});

	it('uses a default model that belongs to the provider model list', () => {
		for (const provider of getSupportedProviders()) {
			const defaultModel = provider.models.find((model) => model.id === provider.defaultModel);

			expect(defaultModel, provider.id).toBeDefined();
			expect(provider.api).toBe(defaultModel?.api);
		}
	});
});
