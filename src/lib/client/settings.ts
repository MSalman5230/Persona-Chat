export type SettingsModelOption = { id: string; name: string };

export { THINKING_LEVELS } from '$lib/shared/thinking';

export type SupportedProviderOption = {
	id: string;
	name: string;
	defaultModel: string;
	models: SettingsModelOption[];
};

export type SavedProviderOption = {
	provider: {
		id: string;
		name: string;
		providerId: string;
		api: string;
		baseUrl: string | null;
		defaultModel: string;
		models: string[];
		favoriteModels: string[];
		defaultThinkingLevel: string;
		hasApiKey: boolean;
		hasHeaders: boolean;
		secretPreview: string | null;
		enabled: boolean;
		isDefault: boolean;
		authHeader: boolean;
	};
	preference: {
		id: string;
		providerConnectionId: string;
		defaultModel: string | null;
		favoriteModels: string[];
		isDefault: boolean;
		createdAt: string | Date;
		updatedAt: string | Date;
	} | null;
	effective: {
		defaultModel: string;
		favoriteModels: string[];
		isDefault: boolean;
	};
};

export type McpServerOption = {
	id: string;
	name: string;
	slug: string;
	transport: string;
	enabled: boolean;
	status: string;
	hasEnvSecrets: boolean;
	hasHeaderSecrets: boolean;
	lastError: string | null;
};

export const MCP_JSON_EXAMPLE = `{
  "mcpServers": {
    "local_memory": {
      "name": "Local Memory",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"],
      "env": {
        "MEMORY_FILE_PATH": "C:/tmp/memory.json"
      }
    },
    "remote_docs": {
      "name": "Remote Docs",
      "url": "https://mcp.example.com/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    }
  }
}`;

export function supportedProviderFor(
	supportedProviders: SupportedProviderOption[],
	providerId: string
): SupportedProviderOption | undefined {
	return supportedProviders.find((provider) => provider.id === providerId);
}

export function isCatalogBackedProvider(
	provider: SavedProviderOption,
	supportedProviders: SupportedProviderOption[]
): boolean {
	return (
		!provider.provider.baseUrl &&
		!!supportedProviderFor(supportedProviders, provider.provider.providerId)
	);
}

export function providerModelOptions(
	provider: SavedProviderOption,
	supportedProviders: SupportedProviderOption[]
): SettingsModelOption[] {
	const supportedProvider = isCatalogBackedProvider(provider, supportedProviders)
		? supportedProviderFor(supportedProviders, provider.provider.providerId)
		: undefined;
	if (supportedProvider) return supportedProvider.models;

	const modelIds =
		provider.provider.models.length > 0
			? provider.provider.models
			: [provider.effective.defaultModel || provider.provider.defaultModel];
	return modelIds.filter(Boolean).map((modelId) => ({ id: modelId, name: modelId }));
}

export function hasModel(options: SettingsModelOption[], modelId: string): boolean {
	return options.some((model) => model.id === modelId);
}

export function defaultModelValue(
	provider: SavedProviderOption,
	options: SettingsModelOption[]
): string {
	return hasModel(options, provider.effective.defaultModel)
		? provider.effective.defaultModel
		: (options[0]?.id ?? provider.effective.defaultModel);
}
