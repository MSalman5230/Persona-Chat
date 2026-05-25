import type { Api, Model } from '@earendil-works/pi-ai';
import { AuthStorage, ModelRegistry } from '@earendil-works/pi-coding-agent';

import type { ProviderConnectionRow } from '$lib/server/repositories/providers';
import {
	getDefaultProviderConnection,
	getDefaultProviderConnectionForUser,
	getProviderConnection,
	getProviderConnectionForUser,
	getProviderSecrets
} from '$lib/server/repositories/providers';
import { isThinkingLevel, type ThinkingLevel } from '$lib/shared/thinking';
import { findSupportedProvider } from './catalog';

export type ProviderRuntime = {
	row: ProviderConnectionRow;
	authStorage: AuthStorage;
	modelRegistry: ModelRegistry;
	model: Model<Api>;
	thinkingLevel: ThinkingLevel | undefined;
};

function toThinkingLevel(value: string | null | undefined): ThinkingLevel | undefined {
	return isThinkingLevel(value) ? value : undefined;
}

function ensureModelIds(row: ProviderConnectionRow): string[] {
	return row.models.length > 0 ? row.models : [row.defaultModel];
}

function buildAuthStorage(row: ProviderConnectionRow): AuthStorage {
	const secrets = getProviderSecrets(row);
	const authStorage = AuthStorage.create();
	if (secrets.apiKey) authStorage.setRuntimeApiKey(row.providerId, secrets.apiKey);
	return authStorage;
}

function registerCustomProvider(row: ProviderConnectionRow, registry: ModelRegistry): void {
	if (!row.baseUrl && findSupportedProvider(row.providerId)) return;
	if (!row.baseUrl) throw new Error(`Custom provider ${row.name} needs a base URL`);

	const secrets = getProviderSecrets(row);
	if (!secrets.apiKey) throw new Error(`Custom provider ${row.name} is missing an API key`);
	registry.registerProvider(row.providerId, {
		name: row.name,
		api: row.api as Api,
		baseUrl: row.baseUrl,
		apiKey: secrets.apiKey,
		authHeader: row.authHeader,
		headers: secrets.headers,
		models: ensureModelIds(row).map((modelId) => ({
			id: modelId,
			name: modelId,
			api: row.api as Api,
			baseUrl: row.baseUrl ?? undefined,
			reasoning: true,
			input: ['text'],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 128_000,
			maxTokens: 8_192,
			headers: secrets.headers
		}))
	});
}

export async function createProviderRuntime(input?: {
	userId?: string;
	providerConnectionId?: string | null;
	modelId?: string | null;
	thinkingLevel?: string | null;
}): Promise<ProviderRuntime> {
	const row = input?.providerConnectionId
		? input.userId
			? await getProviderConnectionForUser(input.providerConnectionId, input.userId)
			: await getProviderConnection(input.providerConnectionId)
		: input?.userId
			? await getDefaultProviderConnectionForUser(input.userId)
			: await getDefaultProviderConnection();

	if (!row || !row.enabled) {
		throw new Error('No enabled provider connection is configured');
	}

	const authStorage = buildAuthStorage(row);
	const modelRegistry = ModelRegistry.inMemory(authStorage);
	registerCustomProvider(row, modelRegistry);

	const modelId = input?.modelId || row.defaultModel;
	const model = modelRegistry.find(row.providerId, modelId);
	if (!model) {
		throw new Error(`Model ${row.providerId}/${modelId} is not available in PI's model registry`);
	}
	if (!modelRegistry.hasConfiguredAuth(model)) {
		throw new Error(`Provider ${row.name} has no configured authentication for ${modelId}`);
	}

	return {
		row,
		authStorage,
		modelRegistry,
		model,
		thinkingLevel: toThinkingLevel(input?.thinkingLevel)
	};
}
