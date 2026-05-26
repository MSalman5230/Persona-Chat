import { error } from '@sveltejs/kit';

import { resolveActiveChatRun } from '$lib/server/chat/runs';
import { serializeChatMessages } from '$lib/server/chat/service';
import { getChatSession, listChatMessages, listChatSessions } from '$lib/server/repositories/chat';
import { listAgentOptions } from '$lib/server/repositories/agents';
import { getEffectiveUserSettings } from '$lib/server/repositories/user-settings';
import { isRecord } from '$lib/server/json';
import { agentIdForClient } from '$lib/shared/prebuilt-general-agent';

function isHttpError(cause: unknown): boolean {
	return isRecord(cause) && typeof cause.status === 'number' && cause.status >= 400;
}

export async function loadChatPageData(userId: string, sessionId: string | null = null) {
	try {
		const [settings, sessions, agents] = await Promise.all([
			getEffectiveUserSettings(userId),
			listChatSessions(userId),
			listAgentOptions(userId)
		]);
		const defaultAgent = agents.find((agent) => agent.isDefault) ?? null;
		const activeSession = sessionId ? await getChatSession(userId, sessionId) : null;

		if (sessionId && !activeSession) error(404, 'Chat session not found');

		const messages = activeSession ? await listChatMessages(activeSession.id) : [];
		const runState = activeSession
			? await resolveActiveChatRun(activeSession.id)
			: { activeRun: null, interruptedRun: null };
		const activeSessionForClient = activeSession
			? { ...activeSession, agentId: agentIdForClient(activeSession.agentId) }
			: null;

		return {
			providers: settings.providers,
			sessions,
			agents,
			defaultAgentId: defaultAgent?.id ?? null,
			defaultProviderId: settings.defaultProviderId,
			defaultModel: settings.defaultModel,
			defaultThinkingLevel: settings.defaultThinkingLevel,
			activeSession: activeSessionForClient,
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
			defaultThinkingLevel: null,
			activeSession: null,
			messages: [],
			activeRun: null,
			interruptedRun: null,
			loadError: cause instanceof Error ? cause.message : 'Database is not ready'
		};
	}
}
