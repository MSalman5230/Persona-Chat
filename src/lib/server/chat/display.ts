import type { PersistedAgentMessage } from '$lib/server/agent/runtime';
import { isRecord } from '$lib/server/json';
import {
	normalizeChatToolDisplays,
	normalizeDisplayDurationMs,
	normalizeDisplayTimestamp,
	normalizeStoredToolStatus
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

function storedThoughtsByIndex(storedDisplay: unknown): Map<number, Record<string, unknown>> {
	const thoughts = isRecord(storedDisplay) ? storedDisplay.thoughts : undefined;
	const result = new Map<number, Record<string, unknown>>();
	if (!Array.isArray(thoughts)) return result;

	for (const thought of thoughts) {
		if (!isRecord(thought) || typeof thought.contentIndex !== 'number') continue;
		result.set(thought.contentIndex, thought);
	}

	return result;
}

function storedToolsByIndex(storedDisplay: unknown): Map<number, Record<string, unknown>> {
	const tools = isRecord(storedDisplay) ? storedDisplay.tools : undefined;
	const result = new Map<number, Record<string, unknown>>();
	if (!Array.isArray(tools)) return result;

	for (const tool of tools) {
		if (!isRecord(tool) || typeof tool.contentIndex !== 'number') continue;
		result.set(tool.contentIndex, tool);
	}

	return result;
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

			return {
				contentIndex,
				text: redacted ? '' : (block.thinking ?? ''),
				status: thoughtStatusFromTiming(timing),
				...(durationMs !== undefined ? { durationMs } : {}),
				...(redacted ? { redacted: true } : {})
			};
		})
		.filter((thought): thought is ChatThoughtDisplay => thought !== undefined);
	const tools = blocks
		.map((block, contentIndex): ChatToolDisplay | undefined => {
			if (block.type !== 'toolCall' || typeof block.id !== 'string' || typeof block.name !== 'string') {
				return undefined;
			}

			return {
				contentIndex,
				id: block.id,
				name: block.name,
				status: 'pending'
			};
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
	const display = buildChatMessageDisplay(message);
	const storedThoughts = storedThoughtsByIndex(storedDisplay);
	const storedTools = storedToolsByIndex(storedDisplay);
	const hydratedToolIndexes = new Set(display.tools.map((tool) => tool.contentIndex));
	const storedOnlyTools = normalizeChatToolDisplays(
		isRecord(storedDisplay) ? storedDisplay.tools : undefined,
		'completed'
	).filter((tool) => !hydratedToolIndexes.has(tool.contentIndex));

	return {
		...display,
		thoughts: display.thoughts.map((thought) => {
			const storedThought = storedThoughts.get(thought.contentIndex);
			const status = storedThought?.status === 'thinking' ? 'thinking' : 'thought';
			const durationMs = normalizeDisplayDurationMs(storedThought?.durationMs);

			return {
				...thought,
				status,
				...(durationMs !== undefined ? { durationMs } : {})
			};
		}),
		tools: [
			...display.tools.map((tool) => {
				const storedTool = storedTools.get(tool.contentIndex);
				const status = normalizeStoredToolStatus(storedTool?.status);
				const startedAt = normalizeDisplayTimestamp(storedTool?.startedAt);
				const durationMs = normalizeDisplayDurationMs(storedTool?.durationMs);

				return {
					...tool,
					status,
					...(startedAt !== undefined ? { startedAt } : {}),
					...(durationMs !== undefined ? { durationMs } : {})
				};
			}),
			...storedOnlyTools
		]
	};
}

export function normalizeAgentMessageForStorage(
	message: AgentMessage,
	thoughtTimings?: ThoughtTimingsByContentIndex
) {
	const display = buildChatMessageDisplay(message, thoughtTimings);

	return {
		role: message.role,
		contentText: display.text,
		piMessage: message as unknown as Record<string, unknown>,
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
