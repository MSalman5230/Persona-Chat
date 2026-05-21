import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { parseJsonRequest } from '$lib/server/api';
import type { PersistedAgentMessage } from '$lib/server/agent/runtime';
import { hydrateChatMessageDisplay } from '$lib/server/chat/display';
import { chatSessionSettingsPatchSchema } from '$lib/server/chat/settings';
import { getChatSession, listChatMessages, updateChatSession } from '$lib/server/repositories/chat';

export const GET: RequestHandler = async ({ params }) => {
	const session = await getChatSession(params.id);
	if (!session) error(404, 'Chat session not found');
	const messages = await listChatMessages(session.id);
	return json({
		session,
		messages: messages.map((message) => {
			const piMessage = message.piMessage as unknown as PersistedAgentMessage;
			const display = hydrateChatMessageDisplay(piMessage, message.display);

			return {
				id: message.id,
				role: message.role,
				text: display.text,
				display,
				...(typeof piMessage.toolName === 'string' ? { toolName: piMessage.toolName } : {}),
				createdAt: message.createdAt
			};
		})
	});
};

export const PATCH: RequestHandler = async ({ params, request }) => {
	const session = await getChatSession(params.id);
	if (!session) error(404, 'Chat session not found');

	const body = await parseJsonRequest(
		request,
		chatSessionSettingsPatchSchema,
		'Invalid chat session settings'
	);
	await updateChatSession(session.id, body);

	return json({
		session: {
			...session,
			...body,
			updatedAt: new Date()
		}
	});
};
