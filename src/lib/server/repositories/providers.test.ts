import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { env } from '$env/dynamic/private';

import { encryptJson } from '$lib/server/crypto';
import {
	resolveProviderConnectionView,
	serializeProviderView,
	type ProviderConnectionRow,
	type UserProviderPreferenceRow
} from './providers';

const now = new Date('2026-05-25T00:00:00.000Z');
const providerId = '00000000-0000-4000-8000-000000000001';
const originalKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
const originalDynamicKey = env.CREDENTIAL_ENCRYPTION_KEY;

beforeEach(() => {
	process.env.CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
	env.CREDENTIAL_ENCRYPTION_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY;
});

afterEach(() => {
	if (originalKey === undefined) delete process.env.CREDENTIAL_ENCRYPTION_KEY;
	else process.env.CREDENTIAL_ENCRYPTION_KEY = originalKey;

	if (originalDynamicKey === undefined) Reflect.deleteProperty(env, 'CREDENTIAL_ENCRYPTION_KEY');
	else env.CREDENTIAL_ENCRYPTION_KEY = originalDynamicKey;
});

function providerRow(overrides: Partial<ProviderConnectionRow> = {}): ProviderConnectionRow {
	return {
		id: providerId,
		name: 'OpenAI',
		providerId: 'openai',
		api: 'responses',
		baseUrl: null,
		defaultModel: 'global-default',
		defaultThinkingLevel: 'medium',
		authHeader: true,
		models: ['global-default', 'user-default', 'favorite-a'],
		favoriteModels: ['global-default'],
		config: {},
		secret: null,
		enabled: true,
		isDefault: false,
		createdAt: now,
		updatedAt: now,
		...overrides
	};
}

function preferenceRow(
	overrides: Partial<UserProviderPreferenceRow> = {}
): UserProviderPreferenceRow {
	return {
		id: '00000000-0000-4000-8000-000000000101',
		userId: 'user-1',
		providerConnectionId: providerId,
		defaultModel: 'user-default',
		favoriteModels: ['favorite-a'],
		isDefault: false,
		createdAt: now,
		updatedAt: now,
		...overrides
	};
}

describe('resolveProviderConnectionView', () => {
	it('uses global provider values when no user preference exists', () => {
		const provider = providerRow({ isDefault: true });
		const view = resolveProviderConnectionView(provider, undefined, null);

		expect(view.preference).toBeNull();
		expect(view.provider.defaultModel).toBe('global-default');
		expect(view.effective).toEqual({
			defaultModel: 'global-default',
			favoriteModels: ['global-default'],
			isDefault: true
		});
	});

	it('applies preference model fields without overwriting provider fields', () => {
		const provider = providerRow({ defaultModel: 'global-default' });
		const preference = preferenceRow({
			defaultModel: 'user-default',
			favoriteModels: ['favorite-a']
		});
		const view = resolveProviderConnectionView(provider, preference, null);

		expect(view.provider.defaultModel).toBe('global-default');
		expect(view.provider.favoriteModels).toEqual(['global-default']);
		expect(view.preference?.defaultModel).toBe('user-default');
		expect(view.effective.defaultModel).toBe('user-default');
		expect(view.effective.favoriteModels).toEqual(['favorite-a']);
	});

	it('uses the user default preference only for effective default status', () => {
		const provider = providerRow({ isDefault: false });
		const preference = preferenceRow({ isDefault: true });
		const view = resolveProviderConnectionView(provider, preference, provider.id);

		expect(view.provider.isDefault).toBe(false);
		expect(view.preference?.isDefault).toBe(true);
		expect(view.effective.isDefault).toBe(true);
	});

	it('falls back to the global default when the user has no default provider', () => {
		const provider = providerRow({ isDefault: true });
		const preference = preferenceRow({ isDefault: false });
		const view = resolveProviderConnectionView(provider, preference, null);

		expect(view.provider.isDefault).toBe(true);
		expect(view.preference?.isDefault).toBe(false);
		expect(view.effective.isDefault).toBe(true);
	});

	it('serializes API key and header secret flags independently', () => {
		const apiOnly = serializeProviderView(
			resolveProviderConnectionView(
				providerRow({ secret: encryptJson({ apiKey: 'sk-test' }) }),
				undefined,
				null
			)
		);
		const headersOnly = serializeProviderView(
			resolveProviderConnectionView(
				providerRow({ secret: encryptJson({ headers: { Authorization: 'Bearer token' } }) }),
				undefined,
				null
			)
		);

		expect(apiOnly.provider).toMatchObject({
			hasApiKey: true,
			hasHeaders: false,
			secretPreview: '••••'
		});
		expect(headersOnly.provider).toMatchObject({
			hasApiKey: false,
			hasHeaders: true,
			secretPreview: '••••'
		});
	});
});
