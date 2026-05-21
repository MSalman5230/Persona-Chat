import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { subscribeToChatRun } from '$lib/server/chat/runs';
import { getChatSession } from '$lib/server/repositories/chat';

function encodeSse(event: string, data: unknown): Uint8Array {
	return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export const GET: RequestHandler = async ({ params, request }) => {
	const session = await getChatSession(params.id);
	if (!session) error(404, 'Chat session not found');

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			let closed = false;
			const send = (event: string, data: unknown) => {
				if (closed || request.signal.aborted) return;
				controller.enqueue(encodeSse(event, data));
			};

			let subscription: Awaited<ReturnType<typeof subscribeToChatRun>> | null = null;
			subscription = await subscribeToChatRun(session.id, ({ event, data }) => {
				send(event, data);
				if (event === 'done' || event === 'run_error') {
					closed = true;
					subscription?.unsubscribe();
					controller.close();
				}
			});

			if (!subscription) {
				send('done', { sessionId: session.id, message: 'No active run' });
				closed = true;
				controller.close();
				return;
			}

			request.signal.addEventListener(
				'abort',
				() => {
					closed = true;
					subscription.unsubscribe();
				},
				{ once: true }
			);
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
