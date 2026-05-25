import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { uniqueTrimmedStrings } from '$lib/server/collections';
import { db } from '$lib/server/db';
import {
	providerConnections,
	userProviderPreferences,
	userSettings
} from '$lib/server/db/schema';
import { isThinkingLevel, type ThinkingLevel } from '$lib/shared/thinking';
import type { ProviderConnectionRow } from './providers';

export type UserProviderOption = Pick<
	ProviderConnectionRow,
	'id' | 'name' | 'providerId' | 'defaultModel' | 'defaultThinkingLevel' | 'models' | 'favoriteModels'
> & {
	isDefault: boolean;
};

export type EffectiveUserSettings = {
	providers: UserProviderOption[];
	defaultProviderId: string | null;
	defaultModel: string | null;
	defaultThinkingLevel: ThinkingLevel | null;
};

const saveUserSettingsSchema = z.object({
	defaultProviderConnectionId: z.string().uuid().optional().nullable(),
	defaultThinkingLevel: z
		.enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh'])
		.optional()
		.nullable()
});

const providerPreferenceSchema = z.object({
	defaultModel: z.string().min(1).optional().nullable(),
	favoriteModels: z.array(z.string().min(1)).default([])
});

type ProviderPreferenceRow = typeof userProviderPreferences.$inferSelect;
type ProviderPreferenceSelection = Pick<
	ProviderPreferenceRow,
	'providerConnectionId' | 'defaultModel' | 'favoriteModels'
>;
type UserSettingsRow = typeof userSettings.$inferSelect;

function modelIdsForProvider(row: Pick<ProviderConnectionRow, 'defaultModel' | 'models'>): string[] {
	const models = uniqueTrimmedStrings(row.models);
	if (!models.includes(row.defaultModel)) models.unshift(row.defaultModel);
	return models;
}

function normalizeFavoriteModels(models: string[], favoriteModels: string[]): string[] {
	const allowed = new Set(models);
	return uniqueTrimmedStrings(favoriteModels).filter((modelId) => allowed.has(modelId));
}

function preferenceForProvider(
	prefs: ProviderPreferenceSelection[],
	providerId: string
): ProviderPreferenceSelection | undefined {
	return prefs.find((pref) => pref.providerConnectionId === providerId);
}

function applyProviderPreference<TProvider extends ProviderConnectionRow | UserProviderOption>(
	provider: TProvider,
	preference: ProviderPreferenceSelection | undefined
): TProvider {
	if (!preference) return provider;

	const models = modelIdsForProvider(provider);
	const defaultModel =
		preference.defaultModel && models.includes(preference.defaultModel)
			? preference.defaultModel
			: provider.defaultModel;

	return {
		...provider,
		defaultModel,
		favoriteModels: normalizeFavoriteModels(models, preference.favoriteModels)
	};
}

function toUserProviderOption(
	provider: ProviderConnectionRow,
	preference: ProviderPreferenceSelection | undefined
): UserProviderOption {
	const safeProvider = applyProviderPreference(provider, preference);
	return {
		id: safeProvider.id,
		name: safeProvider.name,
		providerId: safeProvider.providerId,
		defaultModel: safeProvider.defaultModel,
		defaultThinkingLevel: safeProvider.defaultThinkingLevel,
		models: safeProvider.models,
		favoriteModels: safeProvider.favoriteModels,
		isDefault: safeProvider.isDefault
	};
}

async function getUserSettingsRow(userId: string) {
	const [row] = await db
		.select()
		.from(userSettings)
		.where(eq(userSettings.userId, userId))
		.limit(1);
	return row;
}

async function listUserProviderPreferenceRows(userId: string): Promise<ProviderPreferenceRow[]> {
	return db
		.select()
		.from(userProviderPreferences)
		.where(eq(userProviderPreferences.userId, userId));
}

export function resolveEffectiveProvider<TProvider extends ProviderConnectionRow | UserProviderOption>(
	settings: Pick<UserSettingsRow, 'defaultProviderConnectionId'> | null | undefined,
	providers: TProvider[],
	preferences: ProviderPreferenceSelection[] = []
): TProvider | undefined {
	const provider =
		(settings?.defaultProviderConnectionId
			? providers.find((row) => row.id === settings.defaultProviderConnectionId)
			: undefined) ??
		providers.find((row) => row.isDefault) ??
		providers[0];

	return provider
		? applyProviderPreference(provider, preferenceForProvider(preferences, provider.id))
		: undefined;
}

async function listEffectiveProviderRowsForUser(userId: string): Promise<{
	providers: ProviderConnectionRow[];
	preferences: ProviderPreferenceRow[];
}> {
	const [providers, preferences] = await Promise.all([
		db
			.select()
			.from(providerConnections)
			.where(eq(providerConnections.enabled, true))
			.orderBy(desc(providerConnections.createdAt)),
		listUserProviderPreferenceRows(userId)
	]);

	return { providers, preferences };
}

async function getUserProviderContext(userId: string): Promise<{
	settings: UserSettingsRow | undefined;
	providers: ProviderConnectionRow[];
	preferences: ProviderPreferenceRow[];
}> {
	const [settings, providerContext] = await Promise.all([
		getUserSettingsRow(userId),
		listEffectiveProviderRowsForUser(userId)
	]);
	const { providers, preferences } = providerContext;

	return { settings, providers, preferences };
}

export async function listProviderConnectionsForUser(userId: string): Promise<UserProviderOption[]> {
	const { providers, preferences } = await listEffectiveProviderRowsForUser(userId);

	return providers.map((provider) =>
		toUserProviderOption(provider, preferenceForProvider(preferences, provider.id))
	);
}

export async function getProviderConnectionForUser(
	userId: string,
	providerConnectionId: string
): Promise<ProviderConnectionRow | undefined> {
	const [provider, preferences] = await Promise.all([
		db
			.select()
			.from(providerConnections)
			.where(and(eq(providerConnections.id, providerConnectionId), eq(providerConnections.enabled, true)))
			.limit(1),
		listUserProviderPreferenceRows(userId)
	]);

	return provider[0]
		? applyProviderPreference(provider[0], preferenceForProvider(preferences, provider[0].id))
		: undefined;
}

export async function getDefaultProviderConnectionForUser(
	userId: string
): Promise<ProviderConnectionRow | undefined> {
	const { settings, providers, preferences } = await getUserProviderContext(userId);
	return resolveEffectiveProvider(settings, providers, preferences);
}

export async function getEffectiveUserSettings(userId: string): Promise<EffectiveUserSettings> {
	const { settings, providers, preferences } = await getUserProviderContext(userId);
	const userProviders = providers.map((provider) =>
		toUserProviderOption(provider, preferenceForProvider(preferences, provider.id))
	);
	const selectedProvider = resolveEffectiveProvider(settings, providers, preferences);

	const defaultThinkingLevel = isThinkingLevel(settings?.defaultThinkingLevel)
		? settings.defaultThinkingLevel
		: isThinkingLevel(selectedProvider?.defaultThinkingLevel)
			? selectedProvider.defaultThinkingLevel
			: null;

	return {
		providers: userProviders,
		defaultProviderId: selectedProvider?.id ?? null,
		defaultModel: selectedProvider?.defaultModel ?? null,
		defaultThinkingLevel
	};
}

export async function saveUserSettings(
	userId: string,
	input: z.input<typeof saveUserSettingsSchema>
): Promise<void> {
	const parsed = saveUserSettingsSchema.parse(input);
	const defaultProviderConnectionId = parsed.defaultProviderConnectionId
		? (await getProviderConnectionForUser(userId, parsed.defaultProviderConnectionId))?.id ?? null
		: null;

	await db
		.insert(userSettings)
		.values({
			userId,
			defaultProviderConnectionId,
			defaultThinkingLevel: parsed.defaultThinkingLevel ?? null,
			updatedAt: new Date()
		})
		.onConflictDoUpdate({
			target: userSettings.userId,
			set: {
				defaultProviderConnectionId,
				defaultThinkingLevel: parsed.defaultThinkingLevel ?? null,
				updatedAt: new Date()
			}
		});
}

export async function saveUserProviderPreference(
	userId: string,
	providerConnectionId: string,
	input: z.input<typeof providerPreferenceSchema>
): Promise<void> {
	const provider = await getProviderConnectionForUser(userId, providerConnectionId);
	if (!provider) throw new Error('Provider connection not found');

	const parsed = providerPreferenceSchema.parse(input);
	const models = modelIdsForProvider(provider);
	const defaultModel =
		parsed.defaultModel && models.includes(parsed.defaultModel) ? parsed.defaultModel : null;
	const favoriteModels = normalizeFavoriteModels(models, parsed.favoriteModels);

	await db
		.insert(userProviderPreferences)
		.values({
			userId,
			providerConnectionId,
			defaultModel,
			favoriteModels,
			updatedAt: new Date()
		})
		.onConflictDoUpdate({
			target: [userProviderPreferences.userId, userProviderPreferences.providerConnectionId],
			set: {
				defaultModel,
				favoriteModels,
				updatedAt: new Date()
			}
		});
}
