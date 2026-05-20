import type { PageServerLoad } from './$types';

import { listChatSessions } from '$lib/server/repositories/chat';
import { listProviderConnections } from '$lib/server/repositories/providers';

export const load: PageServerLoad = async () => {
	try {
		const [providers, sessions] = await Promise.all([listProviderConnections(), listChatSessions()]);
		const defaultProvider = providers.find((provider) => provider.isDefault) ?? providers[0];

		return {
			providers,
			sessions,
			defaultProviderId: defaultProvider?.id ?? null,
			defaultModel: defaultProvider?.defaultModel ?? null,
			loadError: null
		};
	} catch (error) {
		return {
			providers: [],
			sessions: [],
			defaultProviderId: null,
			defaultModel: null,
			loadError: error instanceof Error ? error.message : 'Database is not ready'
		};
	}
};
