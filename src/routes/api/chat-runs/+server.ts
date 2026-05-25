import { error, json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';

import { parseJsonRequest } from '$lib/server/api';
import { authenticatedAccess } from '$lib/server/resource-policy';
import { ChatSessionNotFoundError } from '$lib/server/chat/service';
import { ActiveChatRunError, startChatRun } from '$lib/server/chat/runs';
import { temperatureSchema } from '$lib/server/chat/settings';
import { THINKING_LEVELS } from '$lib/shared/thinking';

const chatRunRequestSchema = z.object({
	sessionId: z.string().uuid().optional().nullable(),
	message: z.string().min(1),
	agentId: z.string().uuid().optional().nullable(),
	providerConnectionId: z.string().uuid().optional().nullable(),
	modelId: z.string().min(1).optional().nullable(),
	thinkingLevel: z.enum(THINKING_LEVELS).optional().nullable(),
	temperature: temperatureSchema.optional()
});

export const POST: RequestHandler = async (event) => {
	const access = authenticatedAccess(event);
	const { request } = event;
	const body = await parseJsonRequest(request, chatRunRequestSchema, 'Invalid chat run request');

	try {
		const result = await startChatRun({ ...body, userId: access.userId });
		return json(result, { status: 202 });
	} catch (cause) {
		if (cause instanceof ActiveChatRunError) error(cause.status, cause.message);
		if (cause instanceof ChatSessionNotFoundError) error(404, cause.message);
		throw cause;
	}
};
