import { error, json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';

import { parseJsonRequest } from '$lib/server/api';
import { requireUser } from '$lib/server/auth/guards';
import { ActiveChatRunError, startChatRun } from '$lib/server/chat/runs';
import { temperatureSchema } from '$lib/server/chat/settings';
import { THINKING_LEVELS } from '$lib/shared/thinking';

const chatRunRequestSchema = z.object({
	sessionId: z.string().uuid().optional().nullable(),
	message: z.string().min(1),
	agentId: z.string().uuid().optional(),
	providerConnectionId: z.string().uuid().optional().nullable(),
	modelId: z.string().min(1).optional().nullable(),
	thinkingLevel: z.enum(THINKING_LEVELS).optional().nullable(),
	temperature: temperatureSchema.optional()
});

export const POST: RequestHandler = async ({ locals, request }) => {
	const user = requireUser(locals);
	const body = await parseJsonRequest(request, chatRunRequestSchema, 'Invalid chat run request');

	try {
		const result = await startChatRun({ ...body, userId: user.id });
		return json(result, { status: 202 });
	} catch (cause) {
		if (cause instanceof ActiveChatRunError) error(cause.status, cause.message);
		throw cause;
	}
};
