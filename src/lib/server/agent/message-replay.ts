import type {
	AssistantMessage,
	ImageContent,
	Message,
	StopReason,
	TextContent,
	ThinkingContent,
	ToolCall,
	ToolResultMessage,
	Usage,
	UserMessage
} from '@earendil-works/pi-ai';

import type { PersistedAgentMessage } from './messages';

type ReplaySessionManager = {
	appendMessage(message: Message): unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

function hasTimestamp(message: PersistedAgentMessage): message is PersistedAgentMessage & {
	timestamp: number;
} {
	return typeof message.timestamp === 'number' && Number.isFinite(message.timestamp);
}

function isTextContent(value: unknown): value is TextContent {
	return isRecord(value) && value.type === 'text' && typeof value.text === 'string';
}

function isImageContent(value: unknown): value is ImageContent {
	return (
		isRecord(value) &&
		value.type === 'image' &&
		typeof value.data === 'string' &&
		typeof value.mimeType === 'string'
	);
}

function isThinkingContent(value: unknown): value is ThinkingContent {
	return (
		isRecord(value) &&
		value.type === 'thinking' &&
		typeof value.thinking === 'string' &&
		(value.redacted === undefined || typeof value.redacted === 'boolean')
	);
}

function isToolCall(value: unknown): value is ToolCall {
	return (
		isRecord(value) &&
		value.type === 'toolCall' &&
		typeof value.id === 'string' &&
		typeof value.name === 'string' &&
		isRecord(value.arguments)
	);
}

function isUsage(value: unknown): value is Usage {
	return (
		isRecord(value) &&
		typeof value.input === 'number' &&
		typeof value.output === 'number' &&
		typeof value.cacheRead === 'number' &&
		typeof value.cacheWrite === 'number' &&
		typeof value.totalTokens === 'number' &&
		isRecord(value.cost) &&
		typeof value.cost.input === 'number' &&
		typeof value.cost.output === 'number' &&
		typeof value.cost.cacheRead === 'number' &&
		typeof value.cost.cacheWrite === 'number' &&
		typeof value.cost.total === 'number'
	);
}

function isStopReason(value: unknown): value is StopReason {
	return (
		value === 'stop' ||
		value === 'length' ||
		value === 'toolUse' ||
		value === 'error' ||
		value === 'aborted'
	);
}

function isUserContentBlock(value: unknown): value is TextContent | ImageContent {
	return isTextContent(value) || isImageContent(value);
}

function isUserContent(value: unknown): value is UserMessage['content'] {
	return typeof value === 'string' || (Array.isArray(value) && value.every(isUserContentBlock));
}

function isAssistantContentBlock(
	value: unknown
): value is TextContent | ThinkingContent | ToolCall {
	return isTextContent(value) || isThinkingContent(value) || isToolCall(value);
}

function isToolResultContentBlock(value: unknown): value is ToolResultMessage['content'][number] {
	return isTextContent(value) || isImageContent(value);
}

function isReplayableUserMessage(message: PersistedAgentMessage): message is UserMessage {
	return message.role === 'user' && hasTimestamp(message) && isUserContent(message.content);
}

function isReplayableAssistantMessage(
	message: PersistedAgentMessage
): message is AssistantMessage {
	return (
		message.role === 'assistant' &&
		hasTimestamp(message) &&
		Array.isArray(message.content) &&
		message.content.length > 0 &&
		message.content.every(isAssistantContentBlock) &&
		typeof message.api === 'string' &&
		typeof message.provider === 'string' &&
		typeof message.model === 'string' &&
		isUsage(message.usage) &&
		isStopReason(message.stopReason)
	);
}

function isReplayableToolResultMessage(
	message: PersistedAgentMessage
): message is ToolResultMessage {
	return (
		message.role === 'toolResult' &&
		hasTimestamp(message) &&
		Array.isArray(message.content) &&
		message.content.every(isToolResultContentBlock) &&
		typeof message.toolCallId === 'string' &&
		typeof message.toolName === 'string' &&
		typeof message.isError === 'boolean'
	);
}

export type ReplayablePersistedMessage = Message;

function asPersistedAgentMessage(message: unknown): PersistedAgentMessage | null {
	if (!isRecord(message) || typeof message.role !== 'string') return null;
	return message as PersistedAgentMessage;
}

export function isReplayableAgentMessage(message: unknown): message is ReplayablePersistedMessage {
	const persisted = asPersistedAgentMessage(message);
	if (!persisted) return false;

	return (
		isReplayableUserMessage(persisted) ||
		isReplayableAssistantMessage(persisted) ||
		isReplayableToolResultMessage(persisted)
	);
}

export function toPersistedAgentMessage(message: PersistedAgentMessage): PersistedAgentMessage {
	return isReplayableAgentMessage(message) ? message : message;
}

export function replayHistory(
	sessionManager: ReplaySessionManager,
	history: PersistedAgentMessage[] = []
): void {
	for (const message of history) {
		if (isReplayableAgentMessage(message)) sessionManager.appendMessage(message);
	}
}
