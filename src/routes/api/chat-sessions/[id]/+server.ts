import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import type { PersistedAgentMessage } from '$lib/server/agent/runtime';
import { hydrateChatMessageDisplay } from '$lib/server/chat/service';
import { getChatSession, listChatMessages } from '$lib/server/repositories/chat';

export const GET: RequestHandler = async ({ params }) => {
	const session = await getChatSession(params.id);
	if (!session) error(404, 'Chat session not found');
	const messages = await listChatMessages(session.id);
	return json({
		session,
		messages: messages.map((message) => {
			const display = hydrateChatMessageDisplay(
				message.piMessage as unknown as PersistedAgentMessage,
				message.display
			);

			return {
				id: message.id,
				role: message.role,
				text: display.text,
				display,
				createdAt: message.createdAt
			};
		})
	});
};
