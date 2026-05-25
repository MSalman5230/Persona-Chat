import { and, eq } from 'drizzle-orm';

import { db } from '$lib/server/db';
import { userProviderPreferences } from '$lib/server/db/schema';
import type {
	ProviderEffectiveSettings,
	PublicProviderConnection,
	PublicProviderRecord,
	PublicUserProviderPreference
} from '$lib/shared/providers';

import {
	getDefaultProviderConnection,
	getProviderConnection,
	getProviderSecrets,
	listProviderConnectionRows,
	normalizeProviderFavoriteModels,
	normalizeProviderModels,
	type ProviderConnectionRow
} from './provider-connections';

export type UserProviderPreferenceRow = typeof userProviderPreferences.$inferSelect;

export type ProviderConnectionView = {
	provider: ProviderConnectionRow;
	preference: UserProviderPreferenceRow | null;
	effective: ProviderEffectiveSettings;
};

export type UserProviderPreferenceInput = {
	providerConnectionId: string;
	defaultModel?: string | null;
	favoriteModels?: string[];
	isDefault?: boolean;
};

export type UserProviderContext = {
	preferencesByProvider: Map<string, UserProviderPreferenceRow>;
	userDefaultProviderId: string | null;
};

function serializeProvider(row: ProviderConnectionRow): PublicProviderRecord {
	const secret = getProviderSecrets(row);
	const hasApiKey = Boolean(secret.apiKey);
	const hasHeaders = Boolean(secret.headers && Object.keys(secret.headers).length > 0);
	const hasSecret = hasApiKey || hasHeaders;
	const { secret: _secret, ...publicRow } = row;
	return {
		...publicRow,
		hasApiKey,
		hasHeaders,
		secretPreview: hasSecret ? '••••' : null
	};
}

function serializePreference(
	preference: UserProviderPreferenceRow | null
): PublicUserProviderPreference | null {
	if (!preference) return null;
	const { userId: _userId, ...publicPreference } = preference;
	return publicPreference;
}

export function resolveProviderConnectionView(
	row: ProviderConnectionRow,
	preference: UserProviderPreferenceRow | undefined,
	userDefaultProviderId: string | null
): ProviderConnectionView {
	const resolvedPreference = preference ?? null;
	const isDefault = userDefaultProviderId
		? resolvedPreference?.providerConnectionId === userDefaultProviderId &&
			resolvedPreference.isDefault === true
		: row.isDefault;

	return {
		provider: row,
		preference: resolvedPreference,
		effective: {
			defaultModel: resolvedPreference?.defaultModel || row.defaultModel,
			favoriteModels: resolvedPreference ? resolvedPreference.favoriteModels : row.favoriteModels,
			isDefault
		}
	};
}

export function serializeProviderView(view: ProviderConnectionView): PublicProviderConnection {
	return {
		provider: serializeProvider(view.provider),
		preference: serializePreference(view.preference),
		effective: { ...view.effective }
	};
}

async function preferencesForUser(userId: string): Promise<UserProviderPreferenceRow[]> {
	return db
		.select()
		.from(userProviderPreferences)
		.where(eq(userProviderPreferences.userId, userId));
}

async function loadUserProviderContext(userId: string): Promise<UserProviderContext> {
	const preferences = await preferencesForUser(userId);
	return {
		preferencesByProvider: new Map(
			preferences.map((preference) => [preference.providerConnectionId, preference])
		),
		userDefaultProviderId:
			preferences.find((preference) => preference.isDefault)?.providerConnectionId ?? null
	};
}

function rowWithUserPreferences(
	row: ProviderConnectionRow,
	context: UserProviderContext,
	userDefaultProviderId: string | null = context.userDefaultProviderId
): ProviderConnectionView {
	const preference = context.preferencesByProvider.get(row.id);
	return resolveProviderConnectionView(row, preference, userDefaultProviderId);
}

export function resolveVisibleUserDefaultProviderId(
	rows: ProviderConnectionRow[],
	userDefaultProviderId: string | null
): string | null {
	if (!userDefaultProviderId) return null;
	return rows.some((row) => row.id === userDefaultProviderId) ? userDefaultProviderId : null;
}

export function resolveProviderConnectionViews(
	rows: ProviderConnectionRow[],
	context: UserProviderContext
): ProviderConnectionView[] {
	const userDefaultProviderId = resolveVisibleUserDefaultProviderId(
		rows,
		context.userDefaultProviderId
	);

	return rows.map((row) => rowWithUserPreferences(row, context, userDefaultProviderId));
}

export async function serializeProviderConnectionForUser(
	row: ProviderConnectionRow,
	userId?: string
): Promise<PublicProviderConnection> {
	if (!userId) {
		return serializeProviderView(resolveProviderConnectionView(row, undefined, null));
	}

	const context = await loadUserProviderContext(userId);
	return serializeProviderView(rowWithUserPreferences(row, context));
}

export async function listProviderConnections(
	options: {
		userId?: string;
		enabledOnly?: boolean;
	} = {}
): Promise<PublicProviderConnection[]> {
	const rows = await listProviderConnectionRows(options);

	if (!options.userId) {
		return rows.map((row) =>
			serializeProviderView(resolveProviderConnectionView(row, undefined, null))
		);
	}

	const context = await loadUserProviderContext(options.userId);

	return resolveProviderConnectionViews(rows, context).map(serializeProviderView);
}

export async function getProviderConnectionForUser(
	id: string,
	userId: string
): Promise<ProviderConnectionView | undefined> {
	const row = await getProviderConnection(id);
	if (!row?.enabled) return undefined;

	const context = await loadUserProviderContext(userId);
	return rowWithUserPreferences(row, context);
}

export async function getDefaultProviderConnectionForUser(
	userId: string
): Promise<ProviderConnectionView | undefined> {
	const context = await loadUserProviderContext(userId);

	if (context.userDefaultProviderId) {
		const row = await getProviderConnection(context.userDefaultProviderId);
		if (row?.enabled) {
			return rowWithUserPreferences(row, context);
		}
	}

	const globalDefault = await getDefaultProviderConnection();
	if (!globalDefault) return undefined;

	return rowWithUserPreferences(globalDefault, context, null);
}

export async function saveUserProviderPreference(
	userId: string,
	input: UserProviderPreferenceInput
): Promise<PublicProviderConnection> {
	const provider = await getProviderConnection(input.providerConnectionId);
	if (!provider?.enabled) throw new Error('Provider connection not found');

	const models = normalizeProviderModels(provider.defaultModel, provider.models);
	const defaultModel = input.defaultModel?.trim() || provider.defaultModel;
	if (!models.includes(defaultModel)) throw new Error('Default model is not available for this provider');
	const favoriteModels = normalizeProviderFavoriteModels(input.favoriteModels ?? [], models);
	const isDefault = input.isDefault === true;

	await db.transaction(async (tx) => {
		if (isDefault) {
			await tx
				.update(userProviderPreferences)
				.set({ isDefault: false, updatedAt: new Date() })
				.where(
					and(
						eq(userProviderPreferences.userId, userId),
						eq(userProviderPreferences.isDefault, true)
					)
				);
		}

		return tx
			.insert(userProviderPreferences)
			.values({
				userId,
				providerConnectionId: provider.id,
				defaultModel,
				favoriteModels,
				isDefault
			})
			.onConflictDoUpdate({
				target: [
					userProviderPreferences.userId,
					userProviderPreferences.providerConnectionId
				],
				set: {
					defaultModel,
					favoriteModels,
					isDefault,
					updatedAt: new Date()
				}
			})
			.returning();
	});

	const context = await loadUserProviderContext(userId);
	return serializeProviderView(rowWithUserPreferences(provider, context));
}
