import { booleanFromForm, listFromLines, recordFromJson, stringFromForm } from '$lib/server/forms';
import { tryParseJsonObject } from '$lib/server/json';
import { uniqueTrimmedStrings } from '$lib/server/collections';
import type { ProviderInput, ProviderUpdateInput } from '$lib/server/repositories/providers';

import {
	findSupportedProvider,
	getSupportedProviders,
	type SupportedProvider
} from './catalog';
import type { ThinkingLevel } from './runtime';

export const CUSTOM_PROVIDER_ID = '__custom__';

const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const;

function thinkingLevelFromForm(form: FormData): ThinkingLevel {
	const value = stringFromForm(form, 'defaultThinkingLevel');
	return THINKING_LEVELS.includes(value as ThinkingLevel) ? (value as ThinkingLevel) : 'medium';
}

function favoriteModelsFromForm(form: FormData, availableModelIds: string[]): string[] {
	const allowed = new Set(availableModelIds);
	const requested = form
		.getAll('favoriteModels')
		.flatMap((value) => (typeof value === 'string' ? listFromLines(value) : []));

	return uniqueTrimmedStrings(requested).filter((modelId) => allowed.has(modelId));
}

function legacyProviderPayloadFromForm(
	form: FormData,
	update: boolean
): ProviderInput | ProviderUpdateInput {
	const defaultModel = stringFromForm(form, 'defaultModel');
	if (!defaultModel) throw new Error('Default model is required');

	const models = uniqueTrimmedStrings(listFromLines(stringFromForm(form, 'models')));
	if (!models.includes(defaultModel)) models.unshift(defaultModel);

	const headersValue = stringFromForm(form, 'headersJson');
	const apiKey = stringFromForm(form, 'apiKey');
	const baseUrl = stringFromForm(form, 'baseUrl') ?? null;
	const api = stringFromForm(form, 'api') ?? '';
	const payload = {
		name: stringFromForm(form, 'name') ?? '',
		providerId: stringFromForm(form, 'providerId') ?? '',
		api,
		baseUrl,
		defaultModel,
		defaultThinkingLevel: thinkingLevelFromForm(form),
		authHeader: booleanFromForm(form, 'authHeader', !update),
		models,
		favoriteModels: favoriteModelsFromForm(form, models),
		config: tryParseJsonObject(stringFromForm(form, 'configJson'), 'Provider config'),
		enabled: booleanFromForm(form, 'enabled', !update),
		isDefault: booleanFromForm(form, 'isDefault', false),
		...(apiKey ? { apiKey } : {}),
		...(headersValue ? { headers: recordFromJson(headersValue, 'Headers') } : {})
	};

	if (!update && !payload.name) throw new Error('Provider name is required');
	if (!update && !payload.providerId) throw new Error('Provider ID is required');
	if (!payload.api) throw new Error('API is required');
	if (!payload.baseUrl) throw new Error('Base URL is required');
	if (!update && !apiKey) throw new Error('API key is required');
	return payload;
}

export function builtInProviderPayloadFromForm(
	form: FormData,
	update: false,
	supportedProviders?: SupportedProvider[]
): ProviderInput;
export function builtInProviderPayloadFromForm(
	form: FormData,
	update: true,
	supportedProviders?: SupportedProvider[]
): ProviderUpdateInput;
export function builtInProviderPayloadFromForm(
	form: FormData,
	update: boolean,
	supportedProviders: SupportedProvider[] = getSupportedProviders()
): ProviderInput | ProviderUpdateInput {
	const providerId = stringFromForm(form, 'providerId');
	if (!providerId) throw new Error('Provider is required');

	const provider = findSupportedProvider(providerId, supportedProviders);
	if (!provider) throw new Error(`Provider ${providerId} is not supported`);
	if (provider.models.length === 0) throw new Error(`Provider ${provider.name} has no supported models`);

	const modelId = stringFromForm(form, 'defaultModel') ?? provider.defaultModel;
	const selectedModel = provider.models.find((model) => model.id === modelId);
	if (!selectedModel) throw new Error(`Model ${provider.id}/${modelId} is not supported`);

	const apiKey = stringFromForm(form, 'apiKey');
	const modelIds = provider.models.map((model) => model.id);
	return {
		name: update ? (stringFromForm(form, 'name') ?? provider.name) : provider.name,
		providerId: provider.id,
		api: selectedModel.api,
		baseUrl: null,
		defaultModel: selectedModel.id,
		defaultThinkingLevel: thinkingLevelFromForm(form),
		authHeader: true,
		models: modelIds,
		favoriteModels: favoriteModelsFromForm(form, modelIds),
		config: {},
		enabled: booleanFromForm(form, 'enabled', !update),
		isDefault: booleanFromForm(form, 'isDefault', false),
		...(apiKey ? { apiKey } : {})
	};
}

export function providerPayloadFromForm(
	form: FormData,
	options: {
		update: false;
		supportedProviders?: SupportedProvider[];
	}
): ProviderInput;
export function providerPayloadFromForm(
	form: FormData,
	options: {
		update: true;
		existingBaseUrl?: string | null;
		existingProviderId?: string;
		supportedProviders?: SupportedProvider[];
	}
): ProviderUpdateInput;
export function providerPayloadFromForm(
	form: FormData,
	options: {
		update: boolean;
		existingBaseUrl?: string | null;
		existingProviderId?: string;
		supportedProviders?: SupportedProvider[];
	}
): ProviderInput | ProviderUpdateInput {
	const supportedProviders = options.supportedProviders ?? getSupportedProviders();
	const providerId = options.update ? options.existingProviderId : stringFromForm(form, 'providerId');
	const providerMode = stringFromForm(form, 'providerMode');
	const isCustomProvider =
		(!options.update && providerMode === CUSTOM_PROVIDER_ID) ||
		!!options.existingBaseUrl ||
		(!!providerId && !findSupportedProvider(providerId, supportedProviders));

	if (isCustomProvider) {
		return legacyProviderPayloadFromForm(form, options.update);
	}

	return options.update
		? builtInProviderPayloadFromForm(form, true, supportedProviders)
		: builtInProviderPayloadFromForm(form, false, supportedProviders);
}
