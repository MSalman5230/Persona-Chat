import { createServerAgentSession } from '$lib/server/agent/runtime';
import type { PersistedAgentMessage } from '$lib/server/agent/runtime';
import {
	appendChatMessages,
	createChatSession,
	getChatSession,
	listChatMessages,
	updateChatSession
} from '$lib/server/repositories/chat';

type AgentMessage = PersistedAgentMessage;

type AgentContentBlock = {
	type: string;
	id?: string;
	name?: string;
	text?: string;
	thinking?: string;
	redacted?: boolean;
	[key: string]: unknown;
};

export type ChatThoughtDisplay = {
	contentIndex: number;
	text: string;
	status: 'thinking' | 'thought';
	durationMs?: number;
	redacted?: boolean;
};

export type ChatToolDisplay = {
	contentIndex: number;
	id: string;
	name: string;
	status: 'pending' | 'running' | 'completed' | 'failed';
};

export type ChatMessageDisplay = {
	role: string;
	text: string;
	thoughts: ChatThoughtDisplay[];
	tools: ChatToolDisplay[];
};

export type ThoughtTiming = {
	startedAt?: number;
	endedAt?: number;
	durationMs?: number;
};

export type ThoughtTimingsByContentIndex = Map<number, ThoughtTiming>;
export type ThoughtTimingsByAssistant = Map<number, ThoughtTimingsByContentIndex>;

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

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

function roundedDurationMs(value: unknown): number | undefined {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
	return Math.round(value);
}

function durationFromTiming(timing: ThoughtTiming | undefined): number | undefined {
	const storedDuration = roundedDurationMs(timing?.durationMs);
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

	return {
		...display,
		thoughts: display.thoughts.map((thought) => {
			const storedThought = storedThoughts.get(thought.contentIndex);
			const durationMs = roundedDurationMs(storedThought?.durationMs);

			return {
				...thought,
				status: 'thought',
				...(durationMs !== undefined ? { durationMs } : {})
			};
		}),
		tools: display.tools.map((tool) => {
			const storedTool = storedTools.get(tool.contentIndex);
			const status = storedTool?.status === 'failed' ? 'failed' : 'completed';

			return {
				...tool,
				status
			};
		})
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

function titleFromPrompt(prompt: string): string {
	const cleaned = prompt.replace(/\s+/g, ' ').trim();
	if (!cleaned) return 'New chat';
	return cleaned.length > 56 ? `${cleaned.slice(0, 53)}...` : cleaned;
}

export async function prepareChatTurn(input: {
	sessionId?: string | null;
	message: string;
	providerConnectionId?: string | null;
	modelId?: string | null;
	thinkingLevel?: string | null;
}) {
	const existing = input.sessionId ? await getChatSession(input.sessionId) : undefined;
	const historyRows = existing ? await listChatMessages(existing.id) : [];
	const history = historyRows.map((row) => row.piMessage as unknown as AgentMessage);
	const runtime = await createServerAgentSession({
		providerConnectionId: input.providerConnectionId ?? existing?.providerConnectionId,
		modelId: input.modelId ?? existing?.modelId,
		thinkingLevel: input.thinkingLevel ?? existing?.thinkingLevel,
		history
	});

	const chatSession =
		existing ??
		(await createChatSession({
			title: titleFromPrompt(input.message),
			providerConnectionId: runtime.provider.id,
			providerId: runtime.provider.providerId,
			modelId: runtime.model.id,
			thinkingLevel: runtime.thinkingLevel
		}));

	if (existing) {
		await updateChatSession(existing.id, {
			providerConnectionId: runtime.provider.id,
			providerId: runtime.provider.providerId,
			modelId: runtime.model.id,
			thinkingLevel: runtime.thinkingLevel
		});
	}

	return {
		chatSession,
		runtime,
		historyCount: history.length
	};
}

export async function persistAgentMessages(
	sessionId: string,
	messages: AgentMessage[],
	historyCount: number,
	thoughtTimings?: ThoughtTimingsByAssistant
): Promise<void> {
	const newMessages = messages.slice(historyCount);
	let assistantIndex = -1;

	await appendChatMessages(
		sessionId,
		newMessages.map((message) => {
			const timings = message.role === 'assistant' ? thoughtTimings?.get(++assistantIndex) : undefined;
			return normalizeAgentMessageForStorage(message, timings);
		})
	);
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
	if (!event || typeof event !== 'object') return { type: 'unknown', event };
	const record = event as Record<string, unknown>;
	const message = record.message as AgentMessage | undefined;
	const display = message && typeof message === 'object' ? buildChatMessageDisplay(message, thoughtTimings) : undefined;

	return {
		type: record.type,
		message:
			message && display
				? {
						role: message.role,
						text: display.text,
						display,
						...(typeof message.toolName === 'string' ? { toolName: message.toolName } : {})
					}
				: undefined,
		assistantMessageEvent: normalizeAssistantMessageEvent(record.assistantMessageEvent),
		toolName: record.toolName ?? record.name,
		toolCallId: record.toolCallId,
		isError: record.isError,
		error: record.error,
		willRetry: record.willRetry
	};
}
