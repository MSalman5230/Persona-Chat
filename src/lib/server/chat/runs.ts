import { normalizeAgentEvent, normalizeAgentMessageForStorage } from '$lib/server/chat/display';
import {
	prepareChatTurn,
	serializeChatMessages,
	upsertAgentMessages
} from '$lib/server/chat/service';
import {
	createChatRun,
	getActiveChatRunForSession,
	listChatMessages,
	updateChatRunStatus,
	upsertChatMessage,
	type ChatMessageInput,
	type ChatRunRow
} from '$lib/server/repositories/chat';
import type { PersistedAgentMessage } from '$lib/server/agent/runtime';
import type { ThoughtTimingsByAssistant } from '$lib/server/chat/display';

export type ChatRunInput = {
	sessionId?: string | null;
	message: string;
	providerConnectionId?: string | null;
	modelId?: string | null;
	thinkingLevel?: string | null;
	systemPrompt?: string;
	temperature?: number | null;
};

export type PublicChatRun = {
	id: string;
	sessionId: string;
	status: string;
	errorText: string | null;
	startedAt: Date;
	completedAt: Date | null;
};

export type ChatRunEvent = {
	event: string;
	data: unknown;
};

type Subscriber = (event: ChatRunEvent) => void;

type LiveChatRun = {
	run: ChatRunRow;
	subscribers: Set<Subscriber>;
	messageSnapshots: Map<number, ChatMessageInput>;
	lastAssistantSequence: number;
	closed: boolean;
};

export class ActiveChatRunError extends Error {
	status = 409;

	constructor() {
		super('A response is already streaming for this chat');
	}
}

const liveRuns = new Map<string, LiveChatRun>();
const liveRunsBySession = new Map<string, LiveChatRun>();

export function serializeChatRun(run: ChatRunRow): PublicChatRun {
	return {
		id: run.id,
		sessionId: run.sessionId,
		status: run.status,
		errorText: run.errorText,
		startedAt: run.startedAt,
		completedAt: run.completedAt
	};
}

export function isLiveChatRun(runId: string): boolean {
	return liveRuns.has(runId);
}

function publish(liveRun: LiveChatRun, event: string, data: unknown) {
	for (const subscriber of liveRun.subscribers) {
		subscriber({ event, data });
	}
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

function promptMessage(prompt: string): PersistedAgentMessage {
	return {
		role: 'user',
		content: [{ type: 'text', text: prompt }],
		timestamp: Date.now()
	};
}

function assistantPlaceholder(): PersistedAgentMessage {
	return {
		role: 'assistant',
		content: []
	};
}

async function persistRunMessage(
	liveRun: LiveChatRun,
	sessionId: string,
	sequence: number,
	message: PersistedAgentMessage,
	thoughtTimings?: Parameters<typeof normalizeAgentMessageForStorage>[1]
) {
	const stored = normalizeAgentMessageForStorage(message, thoughtTimings);
	const input: ChatMessageInput = {
		...stored,
		display: stored.display as unknown as Record<string, unknown>
	};
	liveRun.messageSnapshots.set(sequence, input);
	await upsertChatMessage(sessionId, sequence, input);
}

function eventString(payload: Record<string, unknown>, key: string): string | undefined {
	const value = payload[key];
	return typeof value === 'string' ? value : undefined;
}

function eventBoolean(payload: Record<string, unknown>, key: string): boolean | undefined {
	const value = payload[key];
	return typeof value === 'boolean' ? value : undefined;
}

function isUniqueViolation(cause: unknown): boolean {
	return !!cause && typeof cause === 'object' && (cause as { code?: unknown }).code === '23505';
}

export function mergeToolEventIntoStoredMessage(
	message: ChatMessageInput,
	payload: Record<string, unknown>,
	now = Date.now()
): ChatMessageInput {
	const toolName = eventString(payload, 'toolName');
	if (!toolName) return message;

	const toolCallId = eventString(payload, 'toolCallId') ?? toolName;
	const status =
		payload.type === 'tool_execution_end'
			? eventBoolean(payload, 'isError') === true
				? 'failed'
				: 'completed'
			: 'running';
	const display = { ...(message.display ?? {}) };
	const existingTools = Array.isArray(display.tools)
		? (display.tools as Record<string, unknown>[])
		: [];
	const existingIndex = existingTools.findIndex((tool) => tool.id === toolCallId);
	const previous = existingIndex >= 0 ? existingTools[existingIndex] : undefined;
	const startedAt =
		typeof previous?.startedAt === 'number' && Number.isFinite(previous.startedAt)
			? previous.startedAt
			: now;
	const durationMs = status === 'running' ? previous?.durationMs : Math.max(0, now - startedAt);
	const nextTool = {
		contentIndex:
			typeof previous?.contentIndex === 'number' ? previous.contentIndex : existingTools.length,
		id: toolCallId,
		name: toolName,
		status,
		startedAt,
		...(typeof durationMs === 'number' ? { durationMs } : {})
	};
	const tools =
		existingIndex >= 0
			? existingTools.map((tool, index) => (index === existingIndex ? nextTool : tool))
			: [...existingTools, nextTool];

	return {
		...message,
		display: {
			...display,
			tools
		}
	};
}

async function persistToolEvent(
	liveRun: LiveChatRun,
	sessionId: string,
	payload: Record<string, unknown>
) {
	const current = liveRun.messageSnapshots.get(liveRun.lastAssistantSequence);
	if (!current) return;
	const next = mergeToolEventIntoStoredMessage(current, payload);
	liveRun.messageSnapshots.set(liveRun.lastAssistantSequence, next);
	await upsertChatMessage(sessionId, liveRun.lastAssistantSequence, next);
}

async function persistInitialPlaceholders(
	liveRun: LiveChatRun,
	sessionId: string,
	historyCount: number,
	prompt: string
) {
	await persistRunMessage(liveRun, sessionId, historyCount + 1, promptMessage(prompt));
	await persistRunMessage(liveRun, sessionId, historyCount + 2, assistantPlaceholder());
	liveRun.lastAssistantSequence = historyCount + 2;
}

async function publishSnapshot(liveRun: LiveChatRun, activeRun: PublicChatRun | null) {
	const messages = await listChatMessages(liveRun.run.sessionId);
	publish(liveRun, 'snapshot', {
		activeRun,
		messages: serializeChatMessages(messages)
	});
}

async function executeChatRun(
	liveRun: LiveChatRun,
	turn: Awaited<ReturnType<typeof prepareChatTurn>>,
	input: ChatRunInput
) {
	let unsubscribe: (() => void) | undefined;
	let currentSequence = turn.historyCount;
	let assistantIndex = -1;
	const thoughtTimings: ThoughtTimingsByAssistant = new Map();

	try {
		publish(liveRun, 'session', {
			id: turn.chatSession.id,
			title: turn.chatSession.title,
			providerId: turn.runtime.provider.providerId,
			modelId: turn.runtime.model.id,
			systemPrompt: turn.chatSession.systemPrompt,
			temperature: turn.chatSession.temperature,
			tools: turn.runtime.allowedToolNames
		});

		await persistInitialPlaceholders(
			liveRun,
			turn.chatSession.id,
			turn.historyCount,
			input.message
		);
		await publishSnapshot(liveRun, serializeChatRun(liveRun.run));

		unsubscribe = turn.runtime.session.subscribe(async (event) => {
			const record = event as Record<string, unknown>;
			const message = record.message as PersistedAgentMessage | undefined;
			const messageIsAssistant = isAssistantMessage(message);

			if (record.type === 'message_start' && message) {
				currentSequence += 1;
				if (messageIsAssistant) {
					assistantIndex += 1;
					liveRun.lastAssistantSequence = currentSequence;
				}
			}

			if (
				(record.type === 'message_update' || record.type === 'message_end') &&
				messageIsAssistant &&
				assistantIndex < 0
			) {
				assistantIndex = 0;
				liveRun.lastAssistantSequence = Math.max(currentSequence, turn.historyCount + 2);
			}

			if (record.type === 'message_update' && messageIsAssistant) {
				trackThinkingEvent(thoughtTimings, assistantIndex, record.assistantMessageEvent);
			}

			const timings = messageIsAssistant ? thoughtTimings.get(assistantIndex) : undefined;
			const normalized = normalizeAgentEvent(event, timings);

			if (
				message &&
				(record.type === 'message_start' ||
					record.type === 'message_update' ||
					record.type === 'message_end')
			) {
				await persistRunMessage(
					liveRun,
					turn.chatSession.id,
					currentSequence,
					message,
					timings
				);
			}

			if (
				record.type === 'tool_execution_start' ||
				record.type === 'tool_execution_update' ||
				record.type === 'tool_execution_end'
			) {
				await persistToolEvent(liveRun, turn.chatSession.id, normalized);
			}

			publish(liveRun, 'event', normalized);
		});

		await turn.runtime.session.prompt(input.message, { source: 'rpc' });
		await upsertAgentMessages(
			turn.chatSession.id,
			turn.runtime.session.messages as never,
			turn.historyCount,
			thoughtTimings
		);
		await updateChatRunStatus(liveRun.run.id, 'completed');
		await publishSnapshot(liveRun, null);
		publish(liveRun, 'done', {
			runId: liveRun.run.id,
			sessionId: turn.chatSession.id,
			messageCount: turn.runtime.session.messages.length
		});
	} catch (cause) {
		const message = cause instanceof Error ? cause.message : 'Chat request failed';
		await updateChatRunStatus(liveRun.run.id, 'failed', message);
		await publishSnapshot(liveRun, null);
		publish(liveRun, 'run_error', { message, runId: liveRun.run.id });
	} finally {
		unsubscribe?.();
		turn.runtime.session.dispose();
		liveRun.closed = true;
		liveRuns.delete(liveRun.run.id);
		liveRunsBySession.delete(liveRun.run.sessionId);
	}
}

export async function startChatRun(input: ChatRunInput) {
	if (input.sessionId) {
		const active = await resolveActiveChatRun(input.sessionId);
		if (active.activeRun) throw new ActiveChatRunError();
	}

	const turn = await prepareChatTurn(input);
	const active = await resolveActiveChatRun(turn.chatSession.id);
	if (active.activeRun) {
		turn.runtime.session.dispose();
		throw new ActiveChatRunError();
	}

	let run: ChatRunRow;
	try {
		run = await createChatRun(turn.chatSession.id);
	} catch (cause) {
		turn.runtime.session.dispose();
		if (isUniqueViolation(cause)) throw new ActiveChatRunError();
		throw cause;
	}
	const liveRun: LiveChatRun = {
		run,
		subscribers: new Set(),
		messageSnapshots: new Map(),
		lastAssistantSequence: turn.historyCount + 2,
		closed: false
	};
	liveRuns.set(run.id, liveRun);
	liveRunsBySession.set(run.sessionId, liveRun);

	void executeChatRun(liveRun, turn, input);

	return {
		run: serializeChatRun(run),
		session: turn.chatSession
	};
}

export async function resolveActiveChatRun(sessionId: string): Promise<{
	activeRun: PublicChatRun | null;
	interruptedRun: PublicChatRun | null;
}> {
	const dbRun = await getActiveChatRunForSession(sessionId);
	if (!dbRun) return { activeRun: null, interruptedRun: null };

	if (liveRuns.has(dbRun.id)) {
		return { activeRun: serializeChatRun(dbRun), interruptedRun: null };
	}

	await updateChatRunStatus(dbRun.id, 'interrupted', 'Response interrupted by server restart');
	return {
		activeRun: null,
		interruptedRun: serializeChatRun({
			...dbRun,
			status: 'interrupted',
			errorText: 'Response interrupted by server restart',
			completedAt: new Date(),
			updatedAt: new Date()
		})
	};
}

export async function subscribeToChatRun(
	sessionId: string,
	subscriber: Subscriber
): Promise<{ run: PublicChatRun; unsubscribe: () => void } | null> {
	const active = await resolveActiveChatRun(sessionId);
	if (!active.activeRun) return null;
	const liveRun = liveRunsBySession.get(sessionId);
	if (!liveRun) return null;

	liveRun.subscribers.add(subscriber);
	subscriber({
		event: 'snapshot',
		data: {
			activeRun: serializeChatRun(liveRun.run),
			messages: serializeChatMessages(await listChatMessages(sessionId))
		}
	});

	return {
		run: serializeChatRun(liveRun.run),
		unsubscribe: () => liveRun.subscribers.delete(subscriber)
	};
}
