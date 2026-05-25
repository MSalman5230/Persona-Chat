import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { parseJsonRequest } from '$lib/server/api';
import { authenticatedAccess } from '$lib/server/resource-policy';
import { resolveActiveChatRun } from '$lib/server/chat/runs';
import {
	ChatSessionSettingsValidationError,
	updateChatSessionSettings
} from '$lib/server/chat/session-settings';
import { serializeChatMessages } from '$lib/server/chat/service';
import { chatSessionSettingsPatchSchema } from '$lib/server/chat/settings';
import {
	deleteChatSession,
	getChatSession,
	listChatMessages
} from '$lib/server/repositories/chat';

export const GET: RequestHandler = async (event) => {
	const access = authenticatedAccess(event);
	const { params } = event;
	const session = await getChatSession(access.userId, params.id);
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

export const PATCH: RequestHandler = async (event) => {
	const access = authenticatedAccess(event);
	const { params, request } = event;
	const session = await getChatSession(access.userId, params.id);
	if (!session) error(404, 'Chat session not found');

	const body = await parseJsonRequest(
		request,
		chatSessionSettingsPatchSchema,
		'Invalid chat session settings'
	);
	try {
		const updatedSession = await updateChatSessionSettings(access.userId, session, body);

		return json({
			session: updatedSession
		});
	} catch (cause) {
		if (cause instanceof ChatSessionSettingsValidationError) error(400, cause.message);
		throw cause;
	}
};

export const DELETE: RequestHandler = async (event) => {
	const access = authenticatedAccess(event);
	const { params } = event;
	const session = await getChatSession(access.userId, params.id);
	if (!session) error(404, 'Chat session not found');

	const runState = await resolveActiveChatRun(session.id);
	if (runState.activeRun) {
		error(409, 'Wait for the response to finish before deleting this chat');
	}

	await deleteChatSession(access.userId, session.id);
	return json({ ok: true });
};
