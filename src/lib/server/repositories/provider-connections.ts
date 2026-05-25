import { and, desc, eq, ne } from 'drizzle-orm';
import { z } from 'zod';

import { uniqueTrimmedStrings } from '$lib/server/collections';
import { decryptJson, encryptJson } from '$lib/server/crypto';
import { db } from '$lib/server/db';
import {
	providerConnections,
	type EncryptedJsonPayload,
	type ProviderSecretPayload
} from '$lib/server/db/schema';
import { THINKING_LEVELS } from '$lib/shared/thinking';

export const providerInputSchema = z.object({
	name: z.string().min(1),
	providerId: z.string().min(1).regex(/^[a-zA-Z0-9_.-]+$/),
	api: z.string().min(1).default('openai'),
	baseUrl: z.string().url().optional().nullable(),
	defaultModel: z.string().min(1),
	defaultThinkingLevel: z.enum(THINKING_LEVELS).default('medium'),
	authHeader: z.boolean().default(true),
	models: z.array(z.string().min(1)).default([]),
	favoriteModels: z.array(z.string().min(1)).default([]),
	config: z.record(z.string(), z.unknown()).default({}),
	apiKey: z.string().optional(),
	headers: z.record(z.string(), z.string()).default({}),
	enabled: z.boolean().default(true),
	isDefault: z.boolean().default(false)
});

export const providerUpdateSchema = providerInputSchema.partial().extend({
	apiKey: z.string().optional(),
	headers: z.record(z.string(), z.string()).optional()
});

export type ProviderInput = z.input<typeof providerInputSchema>;
export type ProviderUpdateInput = z.input<typeof providerUpdateSchema>;
export type ProviderConnectionRow = typeof providerConnections.$inferSelect;

type ParsedProviderInput = z.output<typeof providerInputSchema>;
type ParsedProviderUpdate = z.output<typeof providerUpdateSchema>;
type ProviderConnectionPatch = Partial<typeof providerConnections.$inferInsert>;

function decryptProviderSecret(
	secret: EncryptedJsonPayload | null | undefined
): ProviderSecretPayload {
	return decryptJson<ProviderSecretPayload>(secret) ?? {};
}

function buildSecret(input: Pick<ParsedProviderInput, 'apiKey' | 'headers'>): EncryptedJsonPayload | null {
	const secret: ProviderSecretPayload = {};
	if (input.apiKey?.trim()) secret.apiKey = input.apiKey.trim();
	if (input.headers && Object.keys(input.headers).length > 0) secret.headers = input.headers;
	return Object.keys(secret).length > 0 ? encryptJson(secret) : null;
}

function buildUpdatedSecret(
	currentSecret: EncryptedJsonPayload | null,
	input: Pick<ParsedProviderUpdate, 'apiKey' | 'headers'>
): EncryptedJsonPayload | null {
	if (input.apiKey === undefined && input.headers === undefined) return currentSecret;

	const secret = {
		...decryptProviderSecret(currentSecret),
		...(input.apiKey !== undefined
			? input.apiKey.trim()
				? { apiKey: input.apiKey.trim() }
				: { apiKey: undefined }
			: {}),
		...(input.headers !== undefined ? { headers: input.headers } : {})
	} satisfies ProviderSecretPayload;

	return secret.apiKey || (secret.headers && Object.keys(secret.headers).length > 0)
		? encryptJson(secret)
		: null;
}

export function normalizeProviderModels(defaultModel: string, models: string[]): string[] {
	const normalized = uniqueTrimmedStrings(models);
	if (!normalized.includes(defaultModel)) normalized.unshift(defaultModel);
	return normalized;
}

export function normalizeProviderFavoriteModels(
	favoriteModels: string[],
	models: string[]
): string[] {
	const allowed = new Set(models);
	return uniqueTrimmedStrings(favoriteModels).filter((modelId) => allowed.has(modelId));
}

async function ensureSingleDefault(id: string): Promise<void> {
	await db
		.update(providerConnections)
		.set({ isDefault: false, updatedAt: new Date() })
		.where(and(eq(providerConnections.isDefault, true), ne(providerConnections.id, id)));
}

export function buildProviderConnectionPatch(
	current: ProviderConnectionRow,
	parsed: ParsedProviderUpdate,
	updatedAt = new Date()
): ProviderConnectionPatch {
	const nextDefaultModel = parsed.defaultModel ?? current.defaultModel;
	const nextModels =
		parsed.models !== undefined || parsed.defaultModel !== undefined
			? normalizeProviderModels(nextDefaultModel, parsed.models ?? current.models)
			: undefined;
	const nextFavoriteModels =
		parsed.favoriteModels !== undefined || nextModels !== undefined
			? normalizeProviderFavoriteModels(
					parsed.favoriteModels ?? current.favoriteModels,
					nextModels ?? current.models
				)
			: undefined;

	const patch: ProviderConnectionPatch = {
		secret: buildUpdatedSecret(current.secret, parsed),
		updatedAt
	};

	if (parsed.name !== undefined) patch.name = parsed.name;
	if (parsed.providerId !== undefined) patch.providerId = parsed.providerId;
	if (parsed.api !== undefined) patch.api = parsed.api;
	if (parsed.baseUrl !== undefined) patch.baseUrl = parsed.baseUrl ?? null;
	if (parsed.defaultModel !== undefined) patch.defaultModel = parsed.defaultModel;
	if (parsed.defaultThinkingLevel !== undefined) {
		patch.defaultThinkingLevel = parsed.defaultThinkingLevel;
	}
	if (parsed.authHeader !== undefined) patch.authHeader = parsed.authHeader;
	if (nextModels !== undefined) patch.models = nextModels;
	if (nextFavoriteModels !== undefined) patch.favoriteModels = nextFavoriteModels;
	if (parsed.config !== undefined) patch.config = parsed.config;
	if (parsed.enabled !== undefined) patch.enabled = parsed.enabled;
	if (parsed.isDefault !== undefined) patch.isDefault = parsed.isDefault;

	return patch;
}

export async function listProviderConnectionRows(
	options: { enabledOnly?: boolean } = {}
): Promise<ProviderConnectionRow[]> {
	return options.enabledOnly
		? db
				.select()
				.from(providerConnections)
				.where(eq(providerConnections.enabled, true))
				.orderBy(desc(providerConnections.createdAt))
		: db.select().from(providerConnections).orderBy(desc(providerConnections.createdAt));
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

export async function createProviderConnection(
	input: ProviderInput
): Promise<ProviderConnectionRow> {
	const parsed = providerInputSchema.parse(input);
	const existing = await db.select({ id: providerConnections.id }).from(providerConnections).limit(1);
	const models = normalizeProviderModels(parsed.defaultModel, parsed.models);
	const favoriteModels = normalizeProviderFavoriteModels(parsed.favoriteModels, models);
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
	return row;
}

export async function updateProviderConnection(
	id: string,
	input: ProviderUpdateInput
): Promise<ProviderConnectionRow> {
	const current = await getProviderConnection(id);
	if (!current) throw new Error('Provider connection not found');

	const parsed = providerUpdateSchema.parse(input);
	const [row] = await db
		.update(providerConnections)
		.set(buildProviderConnectionPatch(current, parsed))
		.where(eq(providerConnections.id, id))
		.returning();

	if (row.isDefault) await ensureSingleDefault(row.id);
	return row;
}

export async function deleteProviderConnection(id: string): Promise<void> {
	await db.delete(providerConnections).where(eq(providerConnections.id, id));
}

export function getProviderSecrets(row: ProviderConnectionRow): ProviderSecretPayload {
	return decryptProviderSecret(row.secret);
}
