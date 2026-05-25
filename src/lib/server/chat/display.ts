import type { PersistedAgentMessage } from '$lib/server/agent/messages';
import { isRecord } from '$lib/server/json';
import {
	createChatThoughtDisplay,
	createChatToolDisplay,
	normalizeDisplayDurationMs,
	overlayStoredDisplay
} from '$lib/shared/chat-display';
import type {
	ChatMessageDisplay,
	ChatThoughtDisplay,
	ChatToolDisplay
} from '$lib/shared/chat-display';

export type {
	ChatMessageDisplay,
	ChatThoughtDisplay,
	ChatToolDisplay,
	ChatToolStatus
} from '$lib/shared/chat-display';

export type AgentMessage = PersistedAgentMessage;

type AgentContentBlock = {
	type: string;
	id?: string;
	name?: string;
	text?: string;
	thinking?: string;
	redacted?: boolean;
	[key: string]: unknown;
};

export type ThoughtTiming = {
	startedAt?: number;
	endedAt?: number;
	durationMs?: number;
};

export type ThoughtTimingsByContentIndex = Map<number, ThoughtTiming>;
export type ThoughtTimingsByAssistant = Map<number, ThoughtTimingsByContentIndex>;

function contentBlocks(message: AgentMessage): AgentContentBlock[] {
	if (!('content' in message) || !Array.isArray(message.content)) return [];
	return message.content as AgentContentBlock[];
}

function messageText(message: AgentMessage): string {
	if ('content' in message) {
		const content = message.content;
		if (typeof content === 'string') return content;
		if (Array.isArray(content)) {
			return content
				.filter((item) => item.type === 'text' && typeof item.text === 'string')
				.map((item) => item.text)
				.join('\n')
				.trim();
		}
	}
	return '';
}

function durationFromTiming(timing: ThoughtTiming | undefined): number | undefined {
	const storedDuration = normalizeDisplayDurationMs(timing?.durationMs);
	if (storedDuration !== undefined) return storedDuration;
	if (typeof timing?.startedAt !== 'number') return undefined;
	const end = typeof timing.endedAt === 'number' ? timing.endedAt : Date.now();
	return Math.max(0, Math.round(end - timing.startedAt));
}

function thoughtStatusFromTiming(timing: ThoughtTiming | undefined): ChatThoughtDisplay['status'] {
	return timing?.startedAt !== undefined && timing.endedAt === undefined ? 'thinking' : 'thought';
}

export function buildChatMessageDisplay(
	message: AgentMessage,
	thoughtTimings?: ThoughtTimingsByContentIndex
): ChatMessageDisplay {
	const blocks = contentBlocks(message);
	const thoughts = blocks
		.map((block, contentIndex): ChatThoughtDisplay | undefined => {
			if (block.type !== 'thinking') return undefined;
			const timing = thoughtTimings?.get(contentIndex);
			const redacted = block.redacted === true;
			const durationMs = durationFromTiming(timing);

			return createChatThoughtDisplay({
				contentIndex,
				text: redacted ? '' : (block.thinking ?? ''),
				status: thoughtStatusFromTiming(timing),
				durationMs,
				redacted
			});
		})
		.filter((thought): thought is ChatThoughtDisplay => thought !== undefined);
	const tools = blocks
		.map((block, contentIndex): ChatToolDisplay | undefined => {
			if (block.type !== 'toolCall' || typeof block.id !== 'string' || typeof block.name !== 'string') {
				return undefined;
			}

			return createChatToolDisplay({
				contentIndex,
				id: block.id,
				name: block.name,
				status: 'pending'
			});
		})
		.filter((tool): tool is ChatToolDisplay => tool !== undefined);

	return {
		role: message.role,
		text: messageText(message),
		thoughts,
		tools
	};
}

export function hydrateChatMessageDisplay(
	message: AgentMessage,
	storedDisplay: unknown
): ChatMessageDisplay {
	return overlayStoredDisplay(buildChatMessageDisplay(message), storedDisplay);
}

export function normalizeAgentMessageForStorage(
	message: AgentMessage,
	thoughtTimings?: ThoughtTimingsByContentIndex,
	storedDisplay?: unknown
) {
	const hydratedDisplay = buildChatMessageDisplay(message, thoughtTimings);
	const display =
		storedDisplay === undefined ? hydratedDisplay : overlayStoredDisplay(hydratedDisplay, storedDisplay);

	return {
		role: message.role,
		contentText: display.text,
		piMessage: message,
		display
	};
}

function normalizeAssistantMessageEvent(event: unknown): Record<string, unknown> | undefined {
	if (!isRecord(event) || typeof event.type !== 'string') return undefined;

	return {
		type: event.type,
		...(typeof event.contentIndex === 'number' ? { contentIndex: event.contentIndex } : {})
	};
}

export function normalizeAgentEvent(
	event: unknown,
	thoughtTimings?: ThoughtTimingsByContentIndex
): Record<string, unknown> {
	if (!isRecord(event)) return { type: 'unknown', event };
	const message = event.message as AgentMessage | undefined;
	const display = message && typeof message === 'object' ? buildChatMessageDisplay(message, thoughtTimings) : undefined;

	return {
		type: event.type,
		message:
			message && display
				? {
						role: message.role,
						text: display.text,
						display,
						...(typeof message.toolName === 'string' ? { toolName: message.toolName } : {})
					}
				: undefined,
		assistantMessageEvent: normalizeAssistantMessageEvent(event.assistantMessageEvent),
		toolName: event.toolName ?? event.name,
		toolCallId: event.toolCallId,
		isError: event.isError,
		error: event.error,
		willRetry: event.willRetry
	};
}
