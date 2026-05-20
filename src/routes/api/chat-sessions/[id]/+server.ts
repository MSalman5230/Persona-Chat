import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { getChatSession, listChatMessages } from '$lib/server/repositories/chat';

export const GET: RequestHandler = async ({ params }) => {
	const session = await getChatSession(params.id);
	if (!session) error(404, 'Chat session not found');
	const messages = await listChatMessages(session.id);
	return json({
		session,
		messages: messages.map((message) => ({
			id: message.id,
			role: message.role,
			text: message.contentText,
			display: message.display,
			createdAt: message.createdAt
		}))
	});
};
