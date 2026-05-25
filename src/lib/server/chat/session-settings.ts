import { getAgent } from '$lib/server/repositories/agents';
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
	if (patch.agentId !== undefined && patch.agentId !== null) {
		const agent = await getAgent(userId, patch.agentId);
		if (!agent) throw new ChatSessionSettingsValidationError('Selected agent does not exist');
	}

	await updateChatSession(userId, session.id, patch);
	return {
		...session,
		...patch,
		updatedAt: new Date()
	};
}
