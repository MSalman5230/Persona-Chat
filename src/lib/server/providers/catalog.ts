import { getModels, getProviders, type Api, type KnownProvider, type Model } from '@earendil-works/pi-ai';

export type SupportedProviderModel = {
	id: string;
	name: string;
	api: Api;
};

export type SupportedProvider = {
	id: string;
	name: string;
	models: SupportedProviderModel[];
	defaultModel: string;
	api: Api;
};

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
	anthropic: 'Anthropic',
	'amazon-bedrock': 'Amazon Bedrock',
	'azure-openai-responses': 'Azure OpenAI Responses',
	cerebras: 'Cerebras',
	'cloudflare-ai-gateway': 'Cloudflare AI Gateway',
	'cloudflare-workers-ai': 'Cloudflare Workers AI',
	deepseek: 'DeepSeek',
	fireworks: 'Fireworks',
	google: 'Google Gemini',
	'google-vertex': 'Google Vertex AI',
	groq: 'Groq',
	huggingface: 'Hugging Face',
	'kimi-coding': 'Kimi For Coding',
	mistral: 'Mistral',
	minimax: 'MiniMax',
	'minimax-cn': 'MiniMax (China)',
	moonshotai: 'Moonshot AI',
	'moonshotai-cn': 'Moonshot AI (China)',
	opencode: 'OpenCode Zen',
	'opencode-go': 'OpenCode Go',
	openai: 'OpenAI',
	'openai-codex': 'OpenAI Codex',
	openrouter: 'OpenRouter',
	together: 'Together AI',
	'vercel-ai-gateway': 'Vercel AI Gateway',
	xai: 'xAI',
	zai: 'ZAI',
	xiaomi: 'Xiaomi MiMo',
	'xiaomi-token-plan-cn': 'Xiaomi MiMo Token Plan (China)',
	'xiaomi-token-plan-ams': 'Xiaomi MiMo Token Plan (Amsterdam)',
	'xiaomi-token-plan-sgp': 'Xiaomi MiMo Token Plan (Singapore)'
};

function formatProviderName(id: string): string {
	return (
		PROVIDER_DISPLAY_NAMES[id] ??
		id
			.split('-')
			.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
			.join(' ')
	);
}

function toSupportedModel(model: Model<Api>): SupportedProviderModel {
	return {
		id: model.id,
		name: model.name,
		api: model.api
	};
}

export function getSupportedProviders(): SupportedProvider[] {
	return getProviders().map((providerId) => {
		const models = (getModels(providerId as KnownProvider) as Model<Api>[]).map(toSupportedModel);
		const defaultModel = models[0];

		return {
			id: providerId,
			name: formatProviderName(providerId),
			models,
			defaultModel: defaultModel?.id ?? '',
			api: defaultModel?.api ?? 'openai-completions'
		};
	});
}

export function findSupportedProvider(
	providerId: string,
	supportedProviders: SupportedProvider[] = getSupportedProviders()
): SupportedProvider | undefined {
	return supportedProviders.find((provider) => provider.id === providerId);
}
