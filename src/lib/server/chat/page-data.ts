import { error } from '@sveltejs/kit';

import { resolveActiveChatRun } from '$lib/server/chat/runs';
import { serializeChatMessages } from '$lib/server/chat/service';
import { getChatSession, listChatMessages, listChatSessions } from '$lib/server/repositories/chat';
import { listAgentOptions } from '$lib/server/repositories/agents';
import {
	listProviderConnections,
	type PublicProviderConnection
} from '$lib/server/repositories/providers';
import { isRecord } from '$lib/server/json';

function isHttpError(cause: unknown): boolean {
	return isRecord(cause) && typeof cause.status === 'number' && cause.status >= 400;
}

function toChatProviderOption(connection: PublicProviderConnection) {
	return {
		id: connection.provider.id,
		name: connection.provider.name,
		defaultModel: connection.effective.defaultModel,
		models: connection.provider.models,
		favoriteModels: connection.effective.favoriteModels,
		isDefault: connection.effective.isDefault
	};
}

export async function loadChatPageData(userId: string, sessionId: string | null = null) {
	try {
		const [providerConnections, sessions, agents] = await Promise.all([
			listProviderConnections({ userId, enabledOnly: true }),
			listChatSessions(userId),
			listAgentOptions(userId)
		]);
		const providers = providerConnections.map(toChatProviderOption);
		const defaultProvider = providers.find((provider) => provider.isDefault) ?? providers[0];
		const defaultAgent = agents.find((agent) => agent.isDefault) ?? null;
		const activeSession = sessionId ? await getChatSession(userId, sessionId) : null;

		if (sessionId && !activeSession) error(404, 'Chat session not found');

		const messages = activeSession ? await listChatMessages(activeSession.id) : [];
		const runState = activeSession
			? await resolveActiveChatRun(activeSession.id)
			: { activeRun: null, interruptedRun: null };

		return {
			providers,
			sessions,
			agents,
			defaultAgentId: defaultAgent?.id ?? null,
			defaultProviderId: defaultProvider?.id ?? null,
			defaultModel: defaultProvider?.defaultModel ?? null,
			activeSession,
			messages: serializeChatMessages(messages),
			activeRun: runState.activeRun,
			interruptedRun: runState.interruptedRun,
			loadError: null
		};
	} catch (cause) {
		if (isHttpError(cause)) throw cause;

		return {
			providers: [],
			sessions: [],
			agents: [],
			defaultAgentId: null,
			defaultProviderId: null,
			defaultModel: null,
			activeSession: null,
			messages: [],
			activeRun: null,
			interruptedRun: null,
			loadError: cause instanceof Error ? cause.message : 'Database is not ready'
		};
	}
}
