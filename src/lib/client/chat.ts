import {
	applyToolEventToDisplay,
	mergeClientSnapshotThoughtDisplays,
	mergeClientSnapshotTools,
	normalizeChatThoughtDisplays,
	type ChatThoughtDisplay,
	type ChatToolDisplay
} from '$lib/shared/chat-display';
import { isRecord } from '$lib/shared/json';

export { isRecord };

export type UiThought = Omit<ChatThoughtDisplay, 'redacted'> & {
	contentIndex: number;
	text: string;
	redacted: boolean;
	expanded: boolean;
	startedAt?: number;
};

export type UiTool = ChatToolDisplay;

export type UiTurnThought = UiThought & {
	sourceKey: string;
	thoughtKey: string;
};

type UiTurnThoughtSource = {
	sourceKey: string;
	contentIndex: number;
};

export type UiMergedTurnThought = UiThought & {
	thoughtKey: string;
};

export type UiTurnTool = UiTool & {
	sourceKey: string;
	toolKey: string;
};

export type UiMessage = {
	id?: string;
	sequence?: number;
	clientKey: string;
	role: 'user' | 'assistant' | 'tool' | 'system';
	text: string;
	thoughts: UiThought[];
	tools: UiTool[];
	toolName?: string;
};

export type UiConversationTurn = {
	key: string;
	user?: UiMessage;
	systemMessages: UiMessage[];
	assistantMessages: UiMessage[];
	assistantText: string;
	thoughts: UiTurnThought[];
	displayThoughts: UiMergedTurnThought[];
	tools: UiTurnTool[];
};

export type ModelOption = { id: string; name: string };

export {
	CHAT_THINKING_OPTIONS,
	chatThinkingSelectionFromServer,
	thinkingLevelForRequest,
	type ChatThinkingSelection
} from '$lib/shared/thinking';

export type ChatProviderOption = {
	id: string;
	name: string;
	defaultModel: string;
	models: string[];
	favoriteModels: string[];
};

export type SystemPromptPresetOption = {
	id: string;
	name: string;
	prompt: string;
	isDefault: boolean;
};

export const DEFAULT_MANUAL_TEMPERATURE = 0.7;

export function clampTemperature(value: number): number {
	if (!Number.isFinite(value)) return DEFAULT_MANUAL_TEMPERATURE;
	return Math.min(2, Math.max(0, Math.round(value * 10) / 10));
}

export function temperatureFromServer(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? clampTemperature(value) : null;
}

export function sortSystemPromptPresets(
	presets: SystemPromptPresetOption[]
): SystemPromptPresetOption[] {
	return [...presets].sort((a, b) => {
		if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
		return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
	});
}

export function presetIdForPrompt(
	presets: SystemPromptPresetOption[],
	prompt: string
): string {
	return presets.find((preset) => preset.prompt === prompt)?.id ?? '';
}

export function roleFromServer(role: unknown): UiMessage['role'] {
	if (role === 'assistant') return 'assistant';
	if (role === 'toolResult' || role === 'tool') return 'tool';
	if (role === 'system') return 'system';
	return 'user';
}

let localMessageCounter = 0;

function sequenceFromServer(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function clientKeyFromServer(
	payload: Record<string, unknown>,
	previous: UiMessage | undefined,
	role: UiMessage['role']
): string {
	if (previous?.clientKey) return previous.clientKey;
	if (typeof payload.id === 'string') return `id:${payload.id}`;

	const sequence = sequenceFromServer(payload.sequence);
	if (sequence !== undefined) return `seq:${sequence}`;

	localMessageCounter += 1;
	return `local:${role}:${Date.now()}:${localMessageCounter}`;
}

export function createLocalUiMessage(role: UiMessage['role'], text = ''): UiMessage {
	localMessageCounter += 1;
	return {
		clientKey: `local:${role}:${Date.now()}:${localMessageCounter}`,
		role,
		text,
		thoughts: [],
		tools: []
	};
}

export function normalizeServerThoughts(
	thoughts: unknown,
	existingThoughts: UiThought[] = [],
	now = Date.now()
): UiThought[] {
	return normalizeThoughtDisplaysForUi(normalizeChatThoughtDisplays(thoughts), existingThoughts, now);
}

function normalizeSnapshotThoughts(
	thoughts: unknown,
	existingThoughts: UiThought[] = [],
	now = Date.now()
): UiThought[] {
	return normalizeThoughtDisplaysForUi(
		mergeClientSnapshotThoughtDisplays(existingThoughts, thoughts),
		existingThoughts,
		now
	);
}

function normalizeThoughtDisplaysForUi(
	thoughts: ChatThoughtDisplay[],
	existingThoughts: UiThought[] = [],
	now = Date.now()
): UiThought[] {
	const previousByIndex = new Map(
		existingThoughts.map((thought) => [thought.contentIndex, thought])
	);

	return thoughts.map((incoming): UiThought => {
		const previous = previousByIndex.get(incoming.contentIndex);
		const status = incoming.status;
		const durationMs = incoming.durationMs;
		const wasThinking = previous?.status === 'thinking';
		const expanded =
			status === 'thinking' ? true : wasThinking ? false : (previous?.expanded ?? false);
		const startedAt =
			status === 'thinking' ? (previous?.startedAt ?? now - (durationMs ?? 0)) : undefined;
		const redacted = incoming.redacted === true;

		return {
			contentIndex: incoming.contentIndex,
			text: incoming.text,
			status,
			...(durationMs !== undefined ? { durationMs } : {}),
			redacted,
			expanded,
			...(startedAt !== undefined ? { startedAt } : {})
		};
	});
}

export function uiMessageFromServer(
	payload: Record<string, unknown>,
	previous?: UiMessage,
	now = Date.now()
): UiMessage {
	const display = isRecord(payload.display) ? payload.display : undefined;
	const role = roleFromServer(payload.role);
	const sequence = sequenceFromServer(payload.sequence) ?? previous?.sequence;
	const text =
		typeof display?.text === 'string'
			? display.text
			: typeof payload.text === 'string'
				? payload.text
				: '';

	return {
		...(typeof payload.id === 'string' ? { id: payload.id } : previous?.id ? { id: previous.id } : {}),
		...(sequence !== undefined ? { sequence } : {}),
		clientKey: clientKeyFromServer(payload, previous, role),
		role,
		text,
		thoughts: normalizeServerThoughts(display?.thoughts, previous?.thoughts, now),
		tools: mergeClientSnapshotTools(previous?.tools, display?.tools, now),
		...(typeof payload.toolName === 'string' ? { toolName: payload.toolName } : {})
	};
}

function uiMessageFromServerSnapshot(
	payload: Record<string, unknown>,
	previous?: UiMessage,
	now = Date.now()
): UiMessage {
	const display = isRecord(payload.display) ? payload.display : undefined;
	const role = roleFromServer(payload.role);
	const sequence = sequenceFromServer(payload.sequence) ?? previous?.sequence;
	const text =
		typeof display?.text === 'string'
			? display.text
			: typeof payload.text === 'string'
				? payload.text
				: '';

	return {
		...(typeof payload.id === 'string' ? { id: payload.id } : previous?.id ? { id: previous.id } : {}),
		...(sequence !== undefined ? { sequence } : {}),
		clientKey: clientKeyFromServer(payload, previous, role),
		role,
		text,
		thoughts: normalizeSnapshotThoughts(display?.thoughts, previous?.thoughts, now),
		tools: mergeClientSnapshotTools(previous?.tools, display?.tools, now),
		...(typeof payload.toolName === 'string' ? { toolName: payload.toolName } : {})
	};
}

export function uiMessagesFromServerSnapshot(
	payloadMessages: unknown,
	previousMessages: UiMessage[] = [],
	now = Date.now()
): UiMessage[] {
	if (!Array.isArray(payloadMessages)) return [];

	const previousById = new Map(
		previousMessages.flatMap((message): [string, UiMessage][] =>
			message.id ? [[message.id, message]] : []
		)
	);
	const previousBySequence = new Map(
		previousMessages.flatMap((message): [number, UiMessage][] =>
			message.sequence !== undefined ? [[message.sequence, message]] : []
		)
	);

	return payloadMessages.flatMap((payload, index): UiMessage[] => {
		if (!isRecord(payload)) return [];

		const sequence = sequenceFromServer(payload.sequence);
		const previous =
			typeof payload.id === 'string'
				? (previousById.get(payload.id) ??
					(sequence !== undefined ? previousBySequence.get(sequence) : undefined) ??
					previousMessages[index])
				: (sequence !== undefined ? previousBySequence.get(sequence) : undefined) ??
					previousMessages[index];

		return [uiMessageFromServerSnapshot(payload, previous, now)];
	});
}

function matchingMessageIndex(messages: UiMessage[], payload: Record<string, unknown>): number {
	const id = typeof payload.id === 'string' ? payload.id : undefined;
	if (id) {
		const index = messages.findIndex((message) => message.id === id);
		if (index >= 0) return index;
	}

	const sequence = sequenceFromServer(payload.sequence);
	if (sequence !== undefined) {
		const index = messages.findIndex((message) => message.sequence === sequence);
		if (index >= 0) return index;
	}

	const role = roleFromServer(payload.role);
	if (role === 'assistant' || role === 'user') {
		return messages.findLastIndex(
			(message) => message.role === role && message.id === undefined && message.sequence === undefined
		);
	}

	return -1;
}

export function upsertUiMessageFromServer(
	messages: UiMessage[],
	payload: Record<string, unknown>,
	now = Date.now()
): UiMessage[] {
	const index = matchingMessageIndex(messages, payload);
	const previous = index >= 0 ? messages[index] : undefined;
	const next = uiMessageFromServer(payload, previous, now);

	if (index < 0) return [...messages, next];
	return messages.map((message, messageIndex) => (messageIndex === index ? next : message));
}

export function mergeToolIntoAssistant(
	message: UiMessage,
	payload: Record<string, unknown>,
	now = Date.now()
): UiMessage {
	const display = applyToolEventToDisplay(message, payload, now);
	if (display === message) return message;
	return { ...message, tools: display.tools };
}

export function mergeToolEventIntoMessages(
	messages: UiMessage[],
	payload: Record<string, unknown>,
	now = Date.now()
): UiMessage[] {
	const assistantSequence = sequenceFromServer(payload.assistantSequence);
	const sequenceIndex =
		assistantSequence === undefined
			? -1
			: messages.findIndex(
					(message) => message.role === 'assistant' && message.sequence === assistantSequence
				);
	const index =
		sequenceIndex >= 0 ? sequenceIndex : messages.findLastIndex((message) => message.role === 'assistant');

	if (index < 0) return messages;

	const next = mergeToolIntoAssistant(messages[index], payload, now);
	if (next === messages[index]) return messages;
	return messages.map((message, messageIndex) => (messageIndex === index ? next : message));
}

function emptyTurn(key: string): UiConversationTurn {
	return {
		key,
		systemMessages: [],
		assistantMessages: [],
		assistantText: '',
		thoughts: [],
		displayThoughts: [],
		tools: []
	};
}

function appendAssistantToTurn(turn: UiConversationTurn, message: UiMessage): void {
	turn.assistantMessages.push(message);
	if (message.text.trim()) {
		turn.assistantText = turn.assistantText ? `${turn.assistantText}\n\n${message.text}` : message.text;
	}
	turn.thoughts.push(
		...message.thoughts.map((thought) => ({
			...thought,
			sourceKey: message.clientKey,
			thoughtKey: `${message.clientKey}:thought:${thought.contentIndex}`
		}))
	);
	turn.tools.push(
		...message.tools.map((tool) => ({
			...tool,
			sourceKey: message.clientKey,
			toolKey: `${message.clientKey}:tool:${tool.id || tool.contentIndex}`
		}))
	);
}

export function groupMessagesIntoConversationTurns(
	messages: UiMessage[],
	now = Date.now()
): UiConversationTurn[] {
	const turns: UiConversationTurn[] = [];
	let current: UiConversationTurn | undefined;

	for (const message of messages) {
		if (message.role === 'user') {
			current = emptyTurn(`turn:${message.clientKey}`);
			current.user = message;
			turns.push(current);
			continue;
		}

		if (message.role === 'tool') continue;

		current ??= emptyTurn(`turn:${message.clientKey}`);
		if (!turns.includes(current)) turns.push(current);

		if (message.role === 'assistant') {
			appendAssistantToTurn(current, message);
		} else {
			current.systemMessages.push(message);
		}
	}

	for (const turn of turns) {
		turn.displayThoughts = projectTurnThoughtsForDisplay(turn.thoughts, turn.key, now).displayThoughts;
	}

	return turns;
}

function projectTurnThoughtsForDisplay(
	thoughts: UiTurnThought[],
	turnKey: string,
	now = Date.now()
): {
	displayThoughts: UiMergedTurnThought[];
	sourcesByThoughtKey: Map<string, UiTurnThoughtSource[]>;
} {
	if (thoughts.length === 0) {
		return { displayThoughts: [], sourcesByThoughtKey: new Map() };
	}

	let durationMs = 0;
	let hasDuration = false;
	for (const thought of thoughts) {
		const duration = thoughtDurationMs(thought, now);
		if (duration !== undefined) {
			durationMs += duration;
			hasDuration = true;
		}
	}

	const status = thoughts.some((thought) => thought.status === 'thinking') ? 'thinking' : 'thought';
	const redacted = thoughts.every((thought) => thought.redacted);
	const expanded = status === 'thinking' || thoughts.some((thought) => thought.expanded);
	const text = thoughts
		.filter((thought) => !thought.redacted)
		.map((thought) => thought.text.trim())
		.filter(Boolean)
		.join('\n\n');
	const sources = thoughts.map((thought) => ({
		sourceKey: thought.sourceKey,
		contentIndex: thought.contentIndex
	}));
	const startedAt = status === 'thinking' && hasDuration ? now - durationMs : undefined;
	const thoughtKey = `${turnKey}:thoughts`;

	return {
		displayThoughts: [
			{
				contentIndex: thoughts[0].contentIndex,
				text,
				status,
				...(hasDuration ? { durationMs } : {}),
				redacted,
				expanded,
				...(startedAt !== undefined ? { startedAt } : {}),
				thoughtKey
			}
		],
		sourcesByThoughtKey: new Map([[thoughtKey, sources]])
	};
}

export function setConversationTurnThoughtExpanded(
	messages: UiMessage[],
	turnKey: string,
	thoughtKey: string,
	expanded: boolean
): UiMessage[] {
	const turn = groupMessagesIntoConversationTurns(messages).find((item) => item.key === turnKey);
	if (!turn) return messages;

	const sources = projectTurnThoughtsForDisplay(turn.thoughts, turn.key).sourcesByThoughtKey.get(thoughtKey);
	if (!sources?.length) return messages;

	const contentIndexesBySourceKey = new Map<string, Set<number>>();
	for (const source of sources) {
		const indexes = contentIndexesBySourceKey.get(source.sourceKey) ?? new Set<number>();
		indexes.add(source.contentIndex);
		contentIndexesBySourceKey.set(source.sourceKey, indexes);
	}

	let changed = false;
	const nextMessages = messages.map((message) => {
		const sourceIndexes = contentIndexesBySourceKey.get(message.clientKey);
		if (!sourceIndexes) return message;

		let thoughtsChanged = false;
		const thoughts = message.thoughts.map((thought) => {
			if (!sourceIndexes.has(thought.contentIndex) || thought.expanded === expanded) {
				return thought;
			}
			thoughtsChanged = true;
			return { ...thought, expanded };
		});

		if (!thoughtsChanged) return message;
		changed = true;
		return { ...message, thoughts };
	});

	return changed ? nextMessages : messages;
}

export function shouldShowAssistantTurnPlaceholder(
	turn: UiConversationTurn,
	isStreaming: boolean
): boolean {
	return (
		isStreaming &&
		turn.assistantMessages.length > 0 &&
		turn.assistantText.length === 0 &&
		turn.thoughts.length === 0 &&
		turn.tools.length === 0
	);
}

export function thoughtDurationMs(thought: UiThought, now = Date.now()): number | undefined {
	if (thought.status === 'thinking' && thought.startedAt !== undefined) {
		return Math.max(0, now - thought.startedAt);
	}

	return thought.durationMs;
}

export function formatDuration(durationMs: number | undefined): string {
	if (durationMs === undefined) return '';
	if (durationMs < 1000) return '<1s';

	const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
	if (totalSeconds < 60) return `${totalSeconds}s`;

	const minutes = Math.floor(totalSeconds / 60);
	const seconds = String(totalSeconds % 60).padStart(2, '0');
	return `${minutes}m ${seconds}s`;
}

export function toolDurationMs(tool: UiTool, now = Date.now()): number | undefined {
	if (tool.status === 'running' && tool.startedAt !== undefined) {
		return Math.max(0, now - tool.startedAt);
	}

	return tool.durationMs;
}

export function thoughtLabel(thought: UiThought, now = Date.now()): string {
	const duration = formatDuration(thoughtDurationMs(thought, now));
	if (thought.status === 'thinking') return duration ? `Thinking... ${duration}` : 'Thinking...';
	return duration ? `Thought for ${duration}` : 'Thought';
}

export function formatToolName(name: string): string {
	return name.replace(/^mcp_/, '').replace(/_/g, ' ');
}

export function toolStatusLabel(tool: UiTool, now = Date.now()): string {
	const duration = formatDuration(toolDurationMs(tool, now));
	if (tool.status === 'running') {
		return duration
			? `Using ${formatToolName(tool.name)} ${duration}`
			: `Using ${formatToolName(tool.name)}`;
	}
	if (tool.status === 'failed') return `Tool failed: ${formatToolName(tool.name)}`;
	if (tool.status === 'completed') return `Used ${formatToolName(tool.name)}`;
	return `Queued ${formatToolName(tool.name)}`;
}

export function toolActivityLabel(tool: UiTool): string {
	return `tool:${tool.name}`;
}

export function shouldShowAssistantPlaceholder(item: UiMessage, isStreaming: boolean): boolean {
	return (
		item.role === 'assistant' &&
		item.text.length === 0 &&
		item.thoughts.length === 0 &&
		item.tools.length === 0 &&
		isStreaming
	);
}

export function modelOptionsForProvider(provider: ChatProviderOption | undefined): ModelOption[] {
	if (!provider) return [];

	const favoriteModels = provider.favoriteModels;
	const seen = new Set<string>();
	const options: ModelOption[] = [];
	const addModel = (modelId: string) => {
		if (!modelId || seen.has(modelId)) return;
		seen.add(modelId);
		options.push({ id: modelId, name: modelId });
	};

	addModel(provider.defaultModel);
	for (const modelId of provider.models) {
		if (favoriteModels.includes(modelId)) addModel(modelId);
	}

	return options;
}

export async function responseErrorMessage(response: Response, fallback: string): Promise<string> {
	try {
		const payload = (await response.json()) as unknown;
		if (isRecord(payload) && typeof payload.message === 'string') return payload.message;
	} catch {
		return fallback;
	}

	return fallback;
}
