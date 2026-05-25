import { and, desc, eq, ne } from 'drizzle-orm';
import { z } from 'zod';

import { uniqueTrimmedStrings } from '$lib/server/collections';
import { decryptJson, encryptJson } from '$lib/server/crypto';
import { db } from '$lib/server/db';
import {
	providerConnections,
	userProviderPreferences,
	type ProviderSecretPayload,
	type EncryptedJsonPayload
} from '$lib/server/db/schema';

const providerInputSchema = z.object({
	name: z.string().min(1),
	providerId: z.string().min(1).regex(/^[a-zA-Z0-9_.-]+$/),
	api: z.string().min(1).default('openai'),
	baseUrl: z.string().url().optional().nullable(),
	defaultModel: z.string().min(1),
	defaultThinkingLevel: z
		.enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh'])
		.default('medium'),
	authHeader: z.boolean().default(true),
	models: z.array(z.string().min(1)).default([]),
	favoriteModels: z.array(z.string().min(1)).default([]),
	config: z.record(z.string(), z.unknown()).default({}),
	apiKey: z.string().optional(),
	headers: z.record(z.string(), z.string()).default({}),
	enabled: z.boolean().default(true),
	isDefault: z.boolean().default(false)
});

const providerUpdateSchema = providerInputSchema.partial().extend({
	apiKey: z.string().optional(),
	headers: z.record(z.string(), z.string()).optional()
});

export type ProviderInput = z.input<typeof providerInputSchema>;
export type ProviderUpdateInput = z.input<typeof providerUpdateSchema>;
export type ProviderConnectionRow = typeof providerConnections.$inferSelect;
export type UserProviderPreferenceRow = typeof userProviderPreferences.$inferSelect;

export type PublicProviderConnection = Omit<ProviderConnectionRow, 'secret'> & {
	hasApiKey: boolean;
	hasHeaders: boolean;
	secretPreview: string | null;
	providerDefaultModel: string;
	providerFavoriteModels: string[];
	providerIsDefault: boolean;
};

export type UserProviderPreferenceInput = {
	providerConnectionId: string;
	defaultModel?: string | null;
	favoriteModels?: string[];
	isDefault?: boolean;
};

function decryptProviderSecret(
	secret: EncryptedJsonPayload | null | undefined
): ProviderSecretPayload {
	return decryptJson<ProviderSecretPayload>(secret) ?? {};
}

function serializeProvider(row: ProviderConnectionRow): PublicProviderConnection {
	const hasSecret = Boolean(row.secret);
	const { secret: _secret, ...publicRow } = row;
	return {
		...publicRow,
		hasApiKey: hasSecret,
		hasHeaders: hasSecret,
		secretPreview: hasSecret ? '••••' : null,
		providerDefaultModel: row.defaultModel,
		providerFavoriteModels: row.favoriteModels,
		providerIsDefault: row.isDefault
	};
}

function applyPreferenceToRow(
	row: ProviderConnectionRow,
	preference: UserProviderPreferenceRow | undefined,
	isDefault: boolean
): ProviderConnectionRow {
	return {
		...row,
		defaultModel: preference?.defaultModel || row.defaultModel,
		favoriteModels: preference ? preference.favoriteModels : row.favoriteModels,
		isDefault
	};
}

function serializeProviderWithSource(
	sourceRow: ProviderConnectionRow,
	effectiveRow: ProviderConnectionRow
): PublicProviderConnection {
	return {
		...serializeProvider(effectiveRow),
		providerDefaultModel: sourceRow.defaultModel,
		providerFavoriteModels: sourceRow.favoriteModels,
		providerIsDefault: sourceRow.isDefault
	};
}

function buildSecret(input: Pick<ProviderInput, 'apiKey' | 'headers'>): EncryptedJsonPayload | null {
	const secret: ProviderSecretPayload = {};
	if (input.apiKey?.trim()) secret.apiKey = input.apiKey.trim();
	if (input.headers && Object.keys(input.headers).length > 0) secret.headers = input.headers;
	return Object.keys(secret).length > 0 ? encryptJson(secret) : null;
}

function normalizeModels(defaultModel: string, models: string[]): string[] {
	const normalized = uniqueTrimmedStrings(models);
	if (!normalized.includes(defaultModel)) normalized.unshift(defaultModel);
	return normalized;
}

function normalizeFavoriteModels(favoriteModels: string[], models: string[]): string[] {
	const allowed = new Set(models);
	return uniqueTrimmedStrings(favoriteModels).filter((modelId) => allowed.has(modelId));
}

async function ensureSingleDefault(id: string): Promise<void> {
	await db
		.update(providerConnections)
		.set({ isDefault: false, updatedAt: new Date() })
		.where(and(eq(providerConnections.isDefault, true), ne(providerConnections.id, id)));
}

async function preferencesForUser(userId: string): Promise<UserProviderPreferenceRow[]> {
	return db
		.select()
		.from(userProviderPreferences)
		.where(eq(userProviderPreferences.userId, userId));
}

function rowWithUserPreferences(
	row: ProviderConnectionRow,
	preferencesByProvider: Map<string, UserProviderPreferenceRow>,
	userDefaultProviderId: string | null
): ProviderConnectionRow {
	const preference = preferencesByProvider.get(row.id);
	const isDefault = userDefaultProviderId ? preference?.isDefault === true : row.isDefault;
	return applyPreferenceToRow(row, preference, isDefault);
}

export async function listProviderConnections(options: {
	userId?: string;
	enabledOnly?: boolean;
} = {}): Promise<PublicProviderConnection[]> {
	const rows = options.enabledOnly
		? await db
				.select()
				.from(providerConnections)
				.where(eq(providerConnections.enabled, true))
				.orderBy(desc(providerConnections.createdAt))
		: await db.select().from(providerConnections).orderBy(desc(providerConnections.createdAt));

	if (!options.userId) return rows.map(serializeProvider);

	const preferences = await preferencesForUser(options.userId);
	const preferencesByProvider = new Map(
		preferences.map((preference) => [preference.providerConnectionId, preference])
	);
	const userDefaultProviderId =
		preferences.find((preference) => preference.isDefault)?.providerConnectionId ?? null;

	return rows
		.map((row) =>
			serializeProviderWithSource(
				row,
				rowWithUserPreferences(row, preferencesByProvider, userDefaultProviderId)
			)
		);
}

export async function getProviderConnection(id: string): Promise<ProviderConnectionRow | undefined> {
	const [row] = await db
		.select()
		.from(providerConnections)
		.where(eq(providerConnections.id, id))
		.limit(1);
	return row;
}

export async function getProviderConnectionForUser(
	id: string,
	userId: string
): Promise<ProviderConnectionRow | undefined> {
	const row = await getProviderConnection(id);
	if (!row?.enabled) return undefined;

	const preferences = await preferencesForUser(userId);
	const preferencesByProvider = new Map(
		preferences.map((preference) => [preference.providerConnectionId, preference])
	);
	const userDefaultProviderId =
		preferences.find((preference) => preference.isDefault)?.providerConnectionId ?? null;
	return rowWithUserPreferences(row, preferencesByProvider, userDefaultProviderId);
}

export async function getDefaultProviderConnection(): Promise<ProviderConnectionRow | undefined> {
	const [defaultRow] = await db
		.select()
		.from(providerConnections)
		.where(and(eq(providerConnections.enabled, true), eq(providerConnections.isDefault, true)))
		.limit(1);

	if (defaultRow) return defaultRow;

	const [firstEnabled] = await db
		.select()
		.from(providerConnections)
		.where(eq(providerConnections.enabled, true))
		.orderBy(desc(providerConnections.createdAt))
		.limit(1);

	return firstEnabled;
}

export async function getDefaultProviderConnectionForUser(
	userId: string
): Promise<ProviderConnectionRow | undefined> {
	const preferences = await preferencesForUser(userId);
	const preferencesByProvider = new Map(
		preferences.map((preference) => [preference.providerConnectionId, preference])
	);
	const userDefaultProviderId =
		preferences.find((preference) => preference.isDefault)?.providerConnectionId ?? null;

	if (userDefaultProviderId) {
		const row = await getProviderConnection(userDefaultProviderId);
		if (row?.enabled) return applyPreferenceToRow(row, preferencesByProvider.get(row.id), true);
	}

	const globalDefault = await getDefaultProviderConnection();
	if (!globalDefault) return undefined;

	return rowWithUserPreferences(globalDefault, preferencesByProvider, null);
}

export async function createProviderConnection(input: ProviderInput): Promise<PublicProviderConnection> {
	const parsed = providerInputSchema.parse(input);
	const existing = await db.select({ id: providerConnections.id }).from(providerConnections).limit(1);
	const models = normalizeModels(parsed.defaultModel, parsed.models);
	const favoriteModels = normalizeFavoriteModels(parsed.favoriteModels, models);
	const [row] = await db
		.insert(providerConnections)
		.values({
			name: parsed.name,
			providerId: parsed.providerId,
			api: parsed.api,
			baseUrl: parsed.baseUrl ?? null,
			defaultModel: parsed.defaultModel,
			defaultThinkingLevel: parsed.defaultThinkingLevel,
			authHeader: parsed.authHeader,
			models,
			favoriteModels,
			config: parsed.config,
			secret: buildSecret(parsed),
			enabled: parsed.enabled,
			isDefault: parsed.isDefault || existing.length === 0
		})
		.returning();

	if (row.isDefault) await ensureSingleDefault(row.id);
	return serializeProvider(row);
}

export async function updateProviderConnection(
	id: string,
	input: ProviderUpdateInput
): Promise<PublicProviderConnection> {
	const current = await getProviderConnection(id);
	if (!current) throw new Error('Provider connection not found');

	const parsed = providerUpdateSchema.parse(input);
	let nextSecret = current.secret;
	const nextDefaultModel = parsed.defaultModel ?? current.defaultModel;
	const nextModels =
		parsed.models !== undefined || parsed.defaultModel !== undefined
			? normalizeModels(nextDefaultModel, parsed.models ?? current.models)
			: undefined;
	const nextFavoriteModels =
		parsed.favoriteModels !== undefined || nextModels !== undefined
			? normalizeFavoriteModels(parsed.favoriteModels ?? current.favoriteModels, nextModels ?? current.models)
			: undefined;
	if (parsed.apiKey !== undefined || parsed.headers !== undefined) {
		const secret = {
			...decryptProviderSecret(current.secret),
			...(parsed.apiKey !== undefined
				? parsed.apiKey.trim()
					? { apiKey: parsed.apiKey.trim() }
					: { apiKey: undefined }
				: {}),
			...(parsed.headers !== undefined ? { headers: parsed.headers } : {})
		} satisfies ProviderSecretPayload;
		nextSecret =
			secret.apiKey || (secret.headers && Object.keys(secret.headers).length > 0)
				? encryptJson(secret)
				: null;
	}

	const [row] = await db
		.update(providerConnections)
		.set({
			...(parsed.name !== undefined ? { name: parsed.name } : {}),
			...(parsed.providerId !== undefined ? { providerId: parsed.providerId } : {}),
			...(parsed.api !== undefined ? { api: parsed.api } : {}),
			...(parsed.baseUrl !== undefined ? { baseUrl: parsed.baseUrl ?? null } : {}),
			...(parsed.defaultModel !== undefined ? { defaultModel: parsed.defaultModel } : {}),
			...(parsed.defaultThinkingLevel !== undefined
				? { defaultThinkingLevel: parsed.defaultThinkingLevel }
				: {}),
			...(parsed.authHeader !== undefined ? { authHeader: parsed.authHeader } : {}),
			...(nextModels !== undefined ? { models: nextModels } : {}),
			...(nextFavoriteModels !== undefined ? { favoriteModels: nextFavoriteModels } : {}),
			...(parsed.config !== undefined ? { config: parsed.config } : {}),
			...(parsed.enabled !== undefined ? { enabled: parsed.enabled } : {}),
			...(parsed.isDefault !== undefined ? { isDefault: parsed.isDefault } : {}),
			secret: nextSecret,
			updatedAt: new Date()
		})
		.where(eq(providerConnections.id, id))
		.returning();

	if (row.isDefault) await ensureSingleDefault(row.id);
	return serializeProvider(row);
}

export async function deleteProviderConnection(id: string): Promise<void> {
	await db.delete(providerConnections).where(eq(providerConnections.id, id));
}

export async function saveUserProviderPreference(
	userId: string,
	input: UserProviderPreferenceInput
): Promise<PublicProviderConnection> {
	const provider = await getProviderConnection(input.providerConnectionId);
	if (!provider?.enabled) throw new Error('Provider connection not found');

	const models = normalizeModels(provider.defaultModel, provider.models);
	const defaultModel = input.defaultModel?.trim() || provider.defaultModel;
	if (!models.includes(defaultModel)) throw new Error('Default model is not available for this provider');
	const favoriteModels = normalizeFavoriteModels(input.favoriteModels ?? [], models);
	const isDefault = input.isDefault === true;

	const [row] = await db.transaction(async (tx) => {
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

	return serializeProviderWithSource(provider, applyPreferenceToRow(provider, row, row.isDefault));
}

export function getProviderSecrets(row: ProviderConnectionRow): ProviderSecretPayload {
	return decryptProviderSecret(row.secret);
}
