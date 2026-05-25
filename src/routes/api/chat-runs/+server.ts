import { error, json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';

import { parseJsonRequest } from '$lib/server/api';
import { ActiveChatRunError, startChatRun } from '$lib/server/chat/runs';
import { customInstructionSchema, temperatureSchema } from '$lib/server/chat/settings';
import { THINKING_LEVELS } from '$lib/shared/thinking';

const chatRunRequestSchema = z.object({
	sessionId: z.string().uuid().optional().nullable(),
	message: z.string().min(1),
	agentId: z.string().uuid().optional().nullable(),
	providerConnectionId: z.string().uuid().optional().nullable(),
	modelId: z.string().min(1).optional().nullable(),
	thinkingLevel: z.enum(THINKING_LEVELS).optional().nullable(),
	customInstruction: customInstructionSchema.optional(),
	temperature: temperatureSchema.optional()
});

export const POST: RequestHandler = async ({ request }) => {
	const body = await parseJsonRequest(request, chatRunRequestSchema, 'Invalid chat run request');

	try {
		const result = await startChatRun(body);
		return json(result, { status: 202 });
	} catch (cause) {
		if (cause instanceof ActiveChatRunError) error(cause.status, cause.message);
		throw cause;
	}
};
