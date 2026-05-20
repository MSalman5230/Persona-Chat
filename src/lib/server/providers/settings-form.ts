import { booleanFromForm, listFromLines, recordFromJson, stringFromForm } from '$lib/server/forms';
import { tryParseJsonObject } from '$lib/server/json';
import type { ProviderInput, ProviderUpdateInput } from '$lib/server/repositories/providers';

import {
	findSupportedProvider,
	getSupportedProviders,
	type SupportedProvider
} from './catalog';
import type { ThinkingLevel } from './runtime';

type ProviderKind = 'built_in' | 'custom';

const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const;

function thinkingLevelFromForm(form: FormData): ThinkingLevel {
	const value = stringFromForm(form, 'defaultThinkingLevel');
	return THINKING_LEVELS.includes(value as ThinkingLevel) ? (value as ThinkingLevel) : 'medium';
}

function legacyProviderPayloadFromForm(
	form: FormData,
	update: boolean
): ProviderInput | ProviderUpdateInput {
	const defaultModel = stringFromForm(form, 'defaultModel');
	if (!defaultModel) throw new Error('Default model is required');

	const models = listFromLines(stringFromForm(form, 'models'));
	if (!models.includes(defaultModel)) models.unshift(defaultModel);

	const headersValue = stringFromForm(form, 'headersJson');
	const apiKey = stringFromForm(form, 'apiKey');
	const payload = {
		name: stringFromForm(form, 'name') ?? '',
		providerId: stringFromForm(form, 'providerId') ?? '',
		kind: (stringFromForm(form, 'kind') ?? 'built_in') as ProviderKind,
		api: stringFromForm(form, 'api') ?? 'openai',
		baseUrl: stringFromForm(form, 'baseUrl') ?? null,
		defaultModel,
		defaultThinkingLevel: thinkingLevelFromForm(form),
		authHeader: booleanFromForm(form, 'authHeader', !update),
		models,
		config: tryParseJsonObject(stringFromForm(form, 'configJson'), 'Provider config'),
		enabled: booleanFromForm(form, 'enabled', !update),
		isDefault: booleanFromForm(form, 'isDefault', false),
		...(apiKey ? { apiKey } : {}),
		...(headersValue ? { headers: recordFromJson(headersValue, 'Headers') } : {})
	};

	if (!update && !payload.name) throw new Error('Provider name is required');
	if (!update && !payload.providerId) throw new Error('Provider ID is required');
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
	if (!update && stringFromForm(form, 'kind') === 'custom') {
		throw new Error('Custom providers cannot be created from Settings');
	}

	const providerId = stringFromForm(form, 'providerId');
	if (!providerId) throw new Error('Provider is required');

	const provider = findSupportedProvider(providerId, supportedProviders);
	if (!provider) throw new Error(`Provider ${providerId} is not supported`);
	if (provider.models.length === 0) throw new Error(`Provider ${provider.name} has no supported models`);

	const modelId = stringFromForm(form, 'defaultModel') ?? provider.defaultModel;
	const selectedModel = provider.models.find((model) => model.id === modelId);
	if (!selectedModel) throw new Error(`Model ${provider.id}/${modelId} is not supported`);

	const apiKey = stringFromForm(form, 'apiKey');
	return {
		name: provider.name,
		providerId: provider.id,
		kind: 'built_in',
		api: selectedModel.api,
		baseUrl: null,
		defaultModel: selectedModel.id,
		defaultThinkingLevel: thinkingLevelFromForm(form),
		authHeader: true,
		models: provider.models.map((model) => model.id),
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
		existingKind?: ProviderKind;
		supportedProviders?: SupportedProvider[];
	}
): ProviderUpdateInput;
export function providerPayloadFromForm(
	form: FormData,
	options: {
		update: boolean;
		existingKind?: ProviderKind;
		supportedProviders?: SupportedProvider[];
	}
): ProviderInput | ProviderUpdateInput {
	if (options.update && options.existingKind === 'custom') {
		return legacyProviderPayloadFromForm(form, true);
	}

	const supportedProviders = options.supportedProviders ?? getSupportedProviders();
	return options.update
		? builtInProviderPayloadFromForm(form, true, supportedProviders)
		: builtInProviderPayloadFromForm(form, false, supportedProviders);
}
