export type SerializableDate = Date | string;

export type ProviderEffectiveSettings = {
	defaultModel: string;
	favoriteModels: string[];
	isDefault: boolean;
};

export type PublicProviderRecord = {
	id: string;
	name: string;
	providerId: string;
	api: string;
	baseUrl: string | null;
	defaultModel: string;
	defaultThinkingLevel: string;
	authHeader: boolean;
	models: string[];
	favoriteModels: string[];
	config: Record<string, unknown>;
	enabled: boolean;
	isDefault: boolean;
	createdAt: SerializableDate;
	updatedAt: SerializableDate;
	hasApiKey: boolean;
	hasHeaders: boolean;
	secretPreview: string | null;
};

export type PublicUserProviderPreference = {
	id: string;
	providerConnectionId: string;
	defaultModel: string | null;
	favoriteModels: string[];
	isDefault: boolean;
	createdAt: SerializableDate;
	updatedAt: SerializableDate;
};

export type PublicProviderConnection = {
	provider: PublicProviderRecord;
	preference: PublicUserProviderPreference | null;
	effective: ProviderEffectiveSettings;
};
