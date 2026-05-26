import { getAgent, normalizeAgentIdForStorage } from '$lib/server/repositories/agents';
import { updateChatSession, type ChatSessionRow } from '$lib/server/repositories/chat';
import type { ChatSessionSettingsPatch } from './settings';

export class ChatSessionSettingsValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ChatSessionSettingsValidationError';
	}
}

export async function updateChatSessionSettings(
	userId: string,
	session: ChatSessionRow,
	patch: ChatSessionSettingsPatch
): Promise<ChatSessionRow> {
	const normalizedPatch = {
		...patch,
		...(patch.agentId !== undefined
			? { agentId: normalizeAgentIdForStorage(patch.agentId) }
			: {})
	};

	if (typeof normalizedPatch.agentId === 'string') {
		const agent = await getAgent(userId, normalizedPatch.agentId);
		if (!agent) throw new ChatSessionSettingsValidationError('Selected agent does not exist');
	}

	await updateChatSession(userId, session.id, normalizedPatch);
	return {
		...session,
		...normalizedPatch,
		updatedAt: new Date()
	};
}
