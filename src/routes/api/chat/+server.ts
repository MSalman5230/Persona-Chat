import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';

import { parseJsonRequest } from '$lib/server/api';
import { normalizeAgentEvent, type ThoughtTimingsByAssistant } from '$lib/server/chat/display';
import {
	persistAgentMessages,
	prepareChatTurn
} from '$lib/server/chat/service';
import { systemPromptSchema, temperatureSchema } from '$lib/server/chat/settings';

const chatRequestSchema = z.object({
	sessionId: z.string().uuid().optional().nullable(),
	message: z.string().min(1),
	providerConnectionId: z.string().uuid().optional().nullable(),
	modelId: z.string().min(1).optional().nullable(),
	thinkingLevel: z.enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh']).optional().nullable(),
	systemPrompt: systemPromptSchema.optional(),
	temperature: temperatureSchema.optional()
});

function encodeSse(event: string, data: unknown): Uint8Array {
	return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function isAssistantMessage(message: unknown): boolean {
	return !!message && typeof message === 'object' && (message as { role?: unknown }).role === 'assistant';
}

function assistantEventInfo(event: unknown): { type?: string; contentIndex?: number } {
	if (!event || typeof event !== 'object') return {};
	const record = event as Record<string, unknown>;
	return {
		type: typeof record.type === 'string' ? record.type : undefined,
		contentIndex: typeof record.contentIndex === 'number' ? record.contentIndex : undefined
	};
}

function getAssistantTimings(thoughtTimings: ThoughtTimingsByAssistant, assistantIndex: number) {
	let timings = thoughtTimings.get(assistantIndex);
	if (!timings) {
		timings = new Map();
		thoughtTimings.set(assistantIndex, timings);
	}
	return timings;
}

function trackThinkingEvent(
	thoughtTimings: ThoughtTimingsByAssistant,
	assistantIndex: number,
	assistantMessageEvent: unknown
) {
	const { type, contentIndex } = assistantEventInfo(assistantMessageEvent);
	if (
		contentIndex === undefined ||
		(type !== 'thinking_start' && type !== 'thinking_delta' && type !== 'thinking_end')
	) {
		return;
	}

	const now = Date.now();
	const timings = getAssistantTimings(thoughtTimings, assistantIndex);
	const timing = timings.get(contentIndex) ?? {};
	timing.startedAt ??= now;

	if (type === 'thinking_end') {
		timing.endedAt = now;
		timing.durationMs = Math.max(0, now - timing.startedAt);
	}

	timings.set(contentIndex, timing);
}

export const POST: RequestHandler = async ({ request }) => {
	const body = await parseJsonRequest(request, chatRequestSchema, 'Invalid chat request');

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			let unsubscribe: (() => void) | undefined;
			let runtime: Awaited<ReturnType<typeof prepareChatTurn>>['runtime'] | undefined;
			let assistantIndex = -1;
			const thoughtTimings: ThoughtTimingsByAssistant = new Map();

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
					systemPrompt: turn.chatSession.systemPrompt,
					temperature: turn.chatSession.temperature,
					tools: runtime.allowedToolNames
				});

				unsubscribe = runtime.session.subscribe((event) => {
					const record = event as Record<string, unknown>;
					const messageIsAssistant = isAssistantMessage(record.message);

					if (record.type === 'message_start' && messageIsAssistant) {
						assistantIndex += 1;
					}

					if (
						(record.type === 'message_update' || record.type === 'message_end') &&
						messageIsAssistant &&
						assistantIndex < 0
					) {
						assistantIndex = 0;
					}

					if (record.type === 'message_update' && messageIsAssistant) {
						trackThinkingEvent(thoughtTimings, assistantIndex, record.assistantMessageEvent);
					}

					send(
						'event',
						normalizeAgentEvent(
							event,
							messageIsAssistant ? thoughtTimings.get(assistantIndex) : undefined
						)
					);
				});

				await runtime.session.prompt(body.message, { source: 'rpc' });
				await persistAgentMessages(
					turn.chatSession.id,
					runtime.session.messages as never,
					turn.historyCount,
					thoughtTimings
				);

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
