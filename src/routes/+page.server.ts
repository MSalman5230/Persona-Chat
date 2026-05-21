import type { PageServerLoad } from './$types';

import { listChatSessions } from '$lib/server/repositories/chat';
import { listProviderConnections } from '$lib/server/repositories/providers';
import { listSystemPromptPresets } from '$lib/server/repositories/system-prompts';

export const load: PageServerLoad = async () => {
	try {
		const [providers, sessions, systemPromptPresets] = await Promise.all([
			listProviderConnections(),
			listChatSessions(),
			listSystemPromptPresets()
		]);
		const defaultProvider = providers.find((provider) => provider.isDefault) ?? providers[0];
		const defaultSystemPrompt = systemPromptPresets.find((preset) => preset.isDefault) ?? null;

		return {
			providers,
			sessions,
			systemPromptPresets,
			defaultSystemPrompt,
			defaultProviderId: defaultProvider?.id ?? null,
			defaultModel: defaultProvider?.defaultModel ?? null,
			loadError: null
		};
	} catch (error) {
		return {
			providers: [],
			sessions: [],
			systemPromptPresets: [],
			defaultSystemPrompt: null,
			defaultProviderId: null,
			defaultModel: null,
			loadError: error instanceof Error ? error.message : 'Database is not ready'
		};
	}
};
