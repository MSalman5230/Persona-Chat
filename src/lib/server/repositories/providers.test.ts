import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { env } from '$env/dynamic/private';

import { encryptJson } from '$lib/server/crypto';
import {
	buildProviderConnectionPatch,
	providerUpdateSchema,
	resolveProviderConnectionViews,
	resolveProviderConnectionView,
	serializeProviderView,
	type ProviderConnectionRow,
	type UserProviderContext,
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

function userProviderContext(
	preferences: UserProviderPreferenceRow[] = []
): UserProviderContext {
	return {
		preferencesByProvider: new Map(
			preferences.map((preference) => [preference.providerConnectionId, preference])
		),
		userDefaultProviderId:
			preferences.find((preference) => preference.isDefault)?.providerConnectionId ?? null
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

describe('resolveProviderConnectionViews', () => {
	it('marks the visible user default provider as effective default', () => {
		const globalDefault = providerRow({
			id: '00000000-0000-4000-8000-000000000011',
			isDefault: true
		});
		const userDefault = providerRow({
			id: '00000000-0000-4000-8000-000000000022',
			isDefault: false
		});
		const views = resolveProviderConnectionViews(
			[globalDefault, userDefault],
			userProviderContext([
				preferenceRow({
					providerConnectionId: userDefault.id,
					isDefault: true
				})
			])
		);

		expect(views.find((view) => view.provider.id === globalDefault.id)?.effective.isDefault).toBe(
			false
		);
		expect(views.find((view) => view.provider.id === userDefault.id)?.effective.isDefault).toBe(
			true
		);
	});

	it('uses the global default provider when the user has no default provider', () => {
		const globalDefault = providerRow({ isDefault: true });
		const views = resolveProviderConnectionViews(
			[globalDefault],
			userProviderContext([preferenceRow({ isDefault: false })])
		);

		expect(views[0].effective.isDefault).toBe(true);
	});

	it('restores the global default when the user default is not in the visible rows', () => {
		const globalDefault = providerRow({
			id: '00000000-0000-4000-8000-000000000011',
			isDefault: true
		});
		const hiddenUserDefault = providerRow({
			id: '00000000-0000-4000-8000-000000000022',
			enabled: false,
			isDefault: false
		});
		const views = resolveProviderConnectionViews(
			[globalDefault],
			userProviderContext([
				preferenceRow({
					providerConnectionId: hiddenUserDefault.id,
					isDefault: true
				})
			])
		);

		expect(views[0].effective.isDefault).toBe(true);
	});
});

describe('buildProviderConnectionPatch', () => {
	it('builds a small explicit patch and normalizes dependent model fields', () => {
		const updatedAt = new Date('2026-05-25T12:00:00.000Z');
		const parsed = providerUpdateSchema.parse({
			defaultModel: 'next-default',
			models: ['favorite-a'],
			favoriteModels: ['favorite-a', 'missing'],
			baseUrl: null,
			enabled: false
		});
		const patch = buildProviderConnectionPatch(providerRow(), parsed, updatedAt);

		expect(patch).toMatchObject({
			defaultModel: 'next-default',
			models: ['next-default', 'favorite-a'],
			favoriteModels: ['favorite-a'],
			baseUrl: null,
			enabled: false,
			secret: null,
			updatedAt
		});
		expect(patch).not.toHaveProperty('name');
		expect(patch).not.toHaveProperty('providerId');
	});

	it('can clear all stored provider secrets', () => {
		const updatedAt = new Date('2026-05-25T12:00:00.000Z');
		const current = providerRow({
			secret: encryptJson({ apiKey: 'old-key', headers: { Authorization: 'Bearer old' } })
		});
		const parsed = providerUpdateSchema.parse({ apiKey: '', headers: {} });
		const patch = buildProviderConnectionPatch(current, parsed, updatedAt);

		expect(patch).toMatchObject({
			secret: null,
			updatedAt
		});
	});
});
