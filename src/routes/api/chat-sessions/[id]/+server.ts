import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { parseJsonRequest } from '$lib/server/api';
import { resolveActiveChatRun } from '$lib/server/chat/runs';
import { serializeChatMessages } from '$lib/server/chat/service';
import { chatSessionSettingsPatchSchema } from '$lib/server/chat/settings';
import { getChatSession, listChatMessages, updateChatSession } from '$lib/server/repositories/chat';

export const GET: RequestHandler = async ({ params }) => {
	const session = await getChatSession(params.id);
	if (!session) error(404, 'Chat session not found');
	const messages = await listChatMessages(session.id);
	const runState = await resolveActiveChatRun(session.id);
	return json({
		session,
		messages: serializeChatMessages(messages),
		activeRun: runState.activeRun,
		interruptedRun: runState.interruptedRun
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
