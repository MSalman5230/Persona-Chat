import { describe, expect, it } from 'vitest';

import { resolveEffectiveProvider, type UserProviderOption } from './user-settings';

function provider(overrides: Partial<UserProviderOption> & Pick<UserProviderOption, 'id'>): UserProviderOption {
	return {
		id: overrides.id,
		name: overrides.name ?? overrides.id,
		providerId: overrides.providerId ?? 'mock-provider',
		defaultModel: overrides.defaultModel ?? 'base-model',
		defaultThinkingLevel: overrides.defaultThinkingLevel ?? 'medium',
		models: overrides.models ?? ['base-model'],
		favoriteModels: overrides.favoriteModels ?? [],
		isDefault: overrides.isDefault ?? false
	};
}

describe('resolveEffectiveProvider', () => {
	it('uses the selected user provider when it is enabled', () => {
		const selected = resolveEffectiveProvider(
			{ defaultProviderConnectionId: 'provider-2' },
			[
				provider({ id: 'provider-1', isDefault: true }),
				provider({ id: 'provider-2' })
			]
		);

		expect(selected?.id).toBe('provider-2');
	});

	it('falls back when the selected user provider is unavailable', () => {
		const selected = resolveEffectiveProvider(
			{ defaultProviderConnectionId: 'missing-provider' },
			[
				provider({ id: 'provider-1', isDefault: true }),
				provider({ id: 'provider-2' })
			]
		);

		expect(selected?.id).toBe('provider-1');
	});

	it('uses the admin default before the newest enabled provider', () => {
		const selected = resolveEffectiveProvider(null, [
			provider({ id: 'newest-provider' }),
			provider({ id: 'default-provider', isDefault: true })
		]);

		expect(selected?.id).toBe('default-provider');
	});

	it('returns no provider when none are available', () => {
		expect(resolveEffectiveProvider(null, [])).toBeUndefined();
	});

	it('applies preferences to the selected provider default model and favorites', () => {
		const selected = resolveEffectiveProvider(
			{ defaultProviderConnectionId: 'provider-2' },
			[
				provider({ id: 'provider-1', isDefault: true }),
				provider({
					id: 'provider-2',
					defaultModel: 'base-model',
					models: ['base-model', 'preferred-model']
				})
			],
			[
				{
					providerConnectionId: 'provider-2',
					defaultModel: 'preferred-model',
					favoriteModels: ['preferred-model', 'missing-model']
				}
			]
		);

		expect(selected).toMatchObject({
			id: 'provider-2',
			defaultModel: 'preferred-model',
			favoriteModels: ['preferred-model']
		});
	});
});
