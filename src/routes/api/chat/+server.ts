import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';

import {
	normalizeAgentEvent,
	persistAgentMessages,
	prepareChatTurn
} from '$lib/server/chat/service';

const chatRequestSchema = z.object({
	sessionId: z.string().uuid().optional().nullable(),
	message: z.string().min(1),
	providerConnectionId: z.string().uuid().optional().nullable(),
	modelId: z.string().min(1).optional().nullable(),
	thinkingLevel: z.enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh']).optional().nullable()
});

function encodeSse(event: string, data: unknown): Uint8Array {
	return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export const POST: RequestHandler = async ({ request }) => {
	const body = chatRequestSchema.parse(await request.json());

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			let unsubscribe: (() => void) | undefined;
			let runtime: Awaited<ReturnType<typeof prepareChatTurn>>['runtime'] | undefined;

			const send = (event: string, data: unknown) => {
				if (!request.signal.aborted) controller.enqueue(encodeSse(event, data));
			};

			try {
				const turn = await prepareChatTurn(body);
				runtime = turn.runtime;

				send('session', {
					id: turn.chatSession.id,
					title: turn.chatSession.title,
					providerId: runtime.provider.providerId,
					modelId: runtime.model.id,
					tools: runtime.allowedToolNames
				});

				unsubscribe = runtime.session.subscribe((event) => {
					send('event', normalizeAgentEvent(event));
				});

				await runtime.session.prompt(body.message, { source: 'rpc' });
				await persistAgentMessages(turn.chatSession.id, runtime.session.messages as never, turn.historyCount);

				send('done', {
					sessionId: turn.chatSession.id,
					messageCount: runtime.session.messages.length
				});
			} catch (error) {
				send('error', {
					message: error instanceof Error ? error.message : 'Chat request failed'
				});
			} finally {
				unsubscribe?.();
				runtime?.session.dispose();
				controller.close();
			}
		},
		cancel() {
			request.signal.throwIfAborted();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
};

export const GET: RequestHandler = async () => {
	return json({ ok: true, endpoint: 'chat' });
};
