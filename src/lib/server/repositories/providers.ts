import { and, desc, eq, ne } from 'drizzle-orm';
import { z } from 'zod';

import { decryptJson, encryptJson } from '$lib/server/crypto';
import { db } from '$lib/server/db';
import {
	providerConnections,
	type ProviderSecretPayload,
	type EncryptedJsonPayload
} from '$lib/server/db/schema';

const providerInputSchema = z.object({
	name: z.string().min(1),
	providerId: z.string().min(1).regex(/^[a-zA-Z0-9_.-]+$/),
	kind: z.enum(['built_in', 'custom']).default('built_in'),
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

export type PublicProviderConnection = Omit<ProviderConnectionRow, 'secret'> & {
	hasApiKey: boolean;
	hasHeaders: boolean;
	secretPreview: string | null;
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
		secretPreview: hasSecret ? '••••' : null
	};
}

function buildSecret(input: Pick<ProviderInput, 'apiKey' | 'headers'>): EncryptedJsonPayload | null {
	const secret: ProviderSecretPayload = {};
	if (input.apiKey?.trim()) secret.apiKey = input.apiKey.trim();
	if (input.headers && Object.keys(input.headers).length > 0) secret.headers = input.headers;
	return Object.keys(secret).length > 0 ? encryptJson(secret) : null;
}

function uniqueStrings(values: string[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];

	for (const value of values) {
		const trimmed = value.trim();
		if (!trimmed || seen.has(trimmed)) continue;
		seen.add(trimmed);
		result.push(trimmed);
	}

	return result;
}

function normalizeModels(defaultModel: string, models: string[]): string[] {
	const normalized = uniqueStrings(models);
	if (!normalized.includes(defaultModel)) normalized.unshift(defaultModel);
	return normalized;
}

function normalizeFavoriteModels(favoriteModels: string[], models: string[]): string[] {
	const allowed = new Set(models);
	return uniqueStrings(favoriteModels).filter((modelId) => allowed.has(modelId));
}

async function ensureSingleDefault(id: string): Promise<void> {
	await db
		.update(providerConnections)
		.set({ isDefault: false, updatedAt: new Date() })
		.where(and(eq(providerConnections.isDefault, true), ne(providerConnections.id, id)));
}

export async function listProviderConnections(): Promise<PublicProviderConnection[]> {
	const rows = await db.select().from(providerConnections).orderBy(desc(providerConnections.createdAt));
	return rows.map(serializeProvider);
}

export async function listEnabledProviderConnections(): Promise<ProviderConnectionRow[]> {
	return db
		.select()
		.from(providerConnections)
		.where(eq(providerConnections.enabled, true))
		.orderBy(desc(providerConnections.isDefault), desc(providerConnections.createdAt));
}

export async function getProviderConnection(id: string): Promise<ProviderConnectionRow | undefined> {
	const [row] = await db
		.select()
		.from(providerConnections)
		.where(eq(providerConnections.id, id))
		.limit(1);
	return row;
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
			kind: parsed.kind,
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
			...(parsed.kind !== undefined ? { kind: parsed.kind } : {}),
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

export function getProviderSecrets(row: ProviderConnectionRow): ProviderSecretPayload {
	return decryptProviderSecret(row.secret);
}
