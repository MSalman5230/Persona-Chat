import {
	applyToolEvent,
	mergeToolDisplays,
	normalizeChatMessageDisplay,
	normalizeChatThoughts,
	roundedDurationMs,
	type ChatMessageDisplay,
	type ChatThoughtDisplay,
	type ChatToolDisplay
} from '$lib/shared/chat-display';

export type UiThought = {
	contentIndex: ChatThoughtDisplay['contentIndex'];
	text: ChatThoughtDisplay['text'];
	status: ChatThoughtDisplay['status'];
	durationMs?: ChatThoughtDisplay['durationMs'];
	redacted: boolean;
	expanded: boolean;
	startedAt?: ChatThoughtDisplay['startedAt'];
};

export type UiTool = ChatToolDisplay;

export type UiThoughtGroup = {
	contentIndex: number;
	thoughts: UiThought[];
	status: UiThought['status'];
	expanded: boolean;
	startedAt?: number;
	durationMs?: number;
};

export type UiMessage = {
	role: 'user' | 'assistant' | 'tool' | 'system';
	text: string;
	thoughts: UiThought[];
	tools: UiTool[];
	sequence?: number;
	toolName?: string;
	toolCallId?: string;
	isError?: boolean;
};

export type VisibleTool = UiTool & {
	displayKey: string;
};

export type VisibleMessage = Omit<UiMessage, 'tools'> & {
	id: string;
	sourceIndexes: number[];
	sourceSequences: number[];
	tools: VisibleTool[];
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

export function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

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

export function durationFromServer(value: unknown): number | undefined {
	return roundedDurationMs(value);
}

export function normalizeServerThoughts(
	thoughts: unknown,
	existingThoughts: UiThought[] = [],
	now = Date.now()
): UiThought[] {
	if (!Array.isArray(thoughts)) return [];

	const previousByIndex = new Map(
		existingThoughts.map((thought) => [thought.contentIndex, thought])
	);

	return normalizeChatThoughts(thoughts).map((thought): UiThought => {
		const previous = previousByIndex.get(thought.contentIndex);
		const status = thought.status;
		const durationMs = thought.durationMs;
		const wasThinking = previous?.status === 'thinking';
		const expanded =
			status === 'thinking' ? true : wasThinking ? false : (previous?.expanded ?? false);
		const startedAt =
			status === 'thinking'
				? (previous?.startedAt ?? thought.startedAt ?? now - (durationMs ?? 0))
				: undefined;
		const redacted = thought.redacted === true;

		return {
			contentIndex: thought.contentIndex,
			text: thought.text,
			status,
			...(durationMs !== undefined ? { durationMs } : {}),
			redacted,
			expanded,
			...(startedAt !== undefined ? { startedAt } : {})
		};
	});
}

export function normalizeServerTools(
	tools: unknown,
	existingTools: UiTool[] = [],
	now = Date.now()
): UiTool[] {
	if (!Array.isArray(tools)) return [];

	const displayTools = mergeToolDisplays(tools, existingTools);

	return displayTools.map((tool) => ({
		...tool,
		startedAt:
			tool.status === 'running'
				? (tool.startedAt ?? now - (tool.durationMs ?? 0))
				: tool.startedAt
	}));
}

export function uiMessageFromServer(
	payload: Record<string, unknown>,
	previous?: UiMessage,
	now = Date.now()
): UiMessage {
	const display = isRecord(payload.display) ? payload.display : undefined;
	const text =
		typeof display?.text === 'string'
			? display.text
			: typeof payload.text === 'string'
				? payload.text
				: '';

	return {
		role: roleFromServer(payload.role),
		text,
		thoughts: normalizeServerThoughts(display?.thoughts, previous?.thoughts, now),
		tools: normalizeServerTools(display?.tools, previous?.tools, now),
		...(typeof payload.sequence === 'number' ? { sequence: payload.sequence } : {}),
		...(typeof payload.toolName === 'string' ? { toolName: payload.toolName } : {}),
		...(typeof payload.toolCallId === 'string' ? { toolCallId: payload.toolCallId } : {}),
		...(typeof payload.isError === 'boolean' ? { isError: payload.isError } : {})
	};
}

function displayFromUiMessage(message: UiMessage): ChatMessageDisplay {
	return normalizeChatMessageDisplay({
		role: message.role,
		text: message.text,
		thoughts: message.thoughts,
		tools: message.tools
	});
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

export function thoughtGroupForMessage(message: UiMessage): UiThoughtGroup | null {
	if (message.thoughts.length === 0) return null;

	const hasActiveThought = message.thoughts.some((thought) => thought.status === 'thinking');
	const activeStartedAt = message.thoughts
		.filter((thought) => thought.status === 'thinking' && thought.startedAt !== undefined)
		.map((thought) => thought.startedAt as number);
	const completedDurations = message.thoughts
		.map((thought) => thought.durationMs)
		.filter((duration): duration is number => duration !== undefined);
	const durationMs =
		completedDurations.length === 0
			? undefined
			: completedDurations.reduce((total, duration) => total + duration, 0);

	return {
		contentIndex: message.thoughts[0].contentIndex,
		thoughts: message.thoughts,
		status: hasActiveThought ? 'thinking' : 'thought',
		expanded: message.thoughts.some((thought) => thought.expanded),
		...(hasActiveThought && activeStartedAt.length > 0
			? { startedAt: Math.min(...activeStartedAt) }
			: {}),
		...(!hasActiveThought && durationMs !== undefined ? { durationMs } : {})
	};
}

export function thoughtGroupDurationMs(
	group: UiThoughtGroup,
	now = Date.now()
): number | undefined {
	if (group.status === 'thinking' && group.startedAt !== undefined) {
		return Math.max(0, now - group.startedAt);
	}

	return group.durationMs;
}

export function thoughtGroupLabel(group: UiThoughtGroup, now = Date.now()): string {
	const duration = formatDuration(thoughtGroupDurationMs(group, now));
	if (group.status === 'thinking') return duration ? `Thinking... ${duration}` : 'Thinking...';
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

export function shouldShowAssistantPlaceholder(item: UiMessage, isStreaming: boolean): boolean {
	return (
		item.role === 'assistant' &&
		item.text.length === 0 &&
		item.thoughts.length === 0 &&
		item.tools.length === 0 &&
		isStreaming
	);
}

export function mergeToolIntoAssistant(
	current: UiMessage,
	payload: Record<string, unknown>,
	now = Date.now()
): UiMessage {
	const display = applyToolEvent(displayFromUiMessage(current), payload, now);
	return { ...current, tools: display.tools };
}

function nextMergedContentIndex(message: Pick<UiMessage, 'thoughts' | 'tools'>): number {
	const indexes = [...message.thoughts, ...message.tools].map((item) => item.contentIndex);
	return indexes.length === 0 ? 0 : Math.max(...indexes) + 1;
}

function reindexThoughts(thoughts: UiThought[], offset: number): UiThought[] {
	return thoughts.map((thought) => ({
		...thought,
		contentIndex: thought.contentIndex + offset
	}));
}

function reindexTools(tools: UiTool[], offset: number): UiTool[] {
	return tools.map((tool) => ({
		...tool,
		contentIndex: tool.contentIndex + offset
	}));
}

function uniqueNumbers(values: number[]): number[] {
	return [...new Set(values)];
}

function visibleToolKey(tool: UiTool): string {
	return `${tool.id}:${tool.contentIndex}`;
}

function visibleToolsFrom(tools: UiTool[]): VisibleTool[] {
	return tools.map((tool) => ({
		...tool,
		displayKey: visibleToolKey(tool)
	}));
}

function visibleMessageId(
	role: VisibleMessage['role'],
	sourceIndexes: number[],
	sourceSequences: number[]
): string {
	const sourceKey =
		sourceSequences.length > 0 && sourceSequences.length === sourceIndexes.length
			? sourceSequences.join('+')
			: `local:${sourceIndexes.join('+')}`;
	return `${role}:${sourceKey}`;
}

function withVisibleIdentity(message: Omit<VisibleMessage, 'id'>): VisibleMessage {
	return {
		...message,
		id: visibleMessageId(message.role, message.sourceIndexes, message.sourceSequences)
	};
}

function visibleMessageFromRaw(message: UiMessage, index: number): VisibleMessage {
	return withVisibleIdentity({
		...message,
		sourceIndexes: [index],
		sourceSequences: message.sequence !== undefined ? [message.sequence] : [],
		tools: visibleToolsFrom(message.tools)
	});
}

function mergeVisibleTools(first: VisibleTool[], second: VisibleTool[]): VisibleTool[] {
	const toolsByKey = new Map<string, VisibleTool>();

	for (const tool of [...first, ...second]) {
		toolsByKey.set(tool.displayKey, tool);
	}

	return [...toolsByKey.values()];
}

function mergeAssistantMessages(first: VisibleMessage, second: VisibleMessage): VisibleMessage {
	const text = [first.text, second.text].filter((item) => item.trim().length > 0).join('\n\n');
	const offset = nextMergedContentIndex(first);
	const thoughts = [...first.thoughts, ...reindexThoughts(second.thoughts, offset)];
	const tools = mergeVisibleTools(first.tools, visibleToolsFrom(reindexTools(second.tools, offset)));

	return withVisibleIdentity({
		...first,
		role: 'assistant',
		text,
		thoughts,
		tools,
		sourceIndexes: uniqueNumbers([...first.sourceIndexes, ...second.sourceIndexes]),
		sourceSequences: uniqueNumbers([...first.sourceSequences, ...second.sourceSequences])
	});
}

export function projectVisibleMessages(messages: UiMessage[]): VisibleMessage[] {
	const result: VisibleMessage[] = [];

	for (const [index, message] of messages.entries()) {
		if (message.role === 'tool') {
			const previous = result[result.length - 1];
			if (previous?.role === 'assistant' && message.toolName) {
				const merged = mergeToolIntoAssistant(previous, {
					type: 'tool_execution_end',
					toolName: message.toolName,
					...(message.toolCallId ? { toolCallId: message.toolCallId } : {}),
					...(message.isError !== undefined ? { isError: message.isError } : {})
				});
				result[result.length - 1] = withVisibleIdentity({
					...previous,
					tools: visibleToolsFrom(merged.tools)
				});
			}
			continue;
		}

		const visibleMessage = visibleMessageFromRaw(message, index);
		const previous = result[result.length - 1];
		if (message.role === 'assistant' && previous?.role === 'assistant') {
			result[result.length - 1] = mergeAssistantMessages(previous, visibleMessage);
			continue;
		}

		result.push(visibleMessage);
	}

	return result;
}

export function toggleThoughtsForVisibleMessage(
	messages: UiMessage[],
	visibleMessages: VisibleMessage[],
	visibleMessageId: string,
	contentIndex: number
): boolean {
	const visibleMessage = visibleMessages.find((item) => item.id === visibleMessageId);
	if (
		visibleMessage?.role !== 'assistant' ||
		!visibleMessage.thoughts.some((thought) => thought.contentIndex === contentIndex)
	) {
		return false;
	}

	const expanded = visibleMessage.thoughts.some((thought) => thought.expanded);
	let changed = false;

	for (const sourceIndex of visibleMessage.sourceIndexes) {
		const item = messages[sourceIndex];
		if (item?.role !== 'assistant') continue;

		for (const thought of item.thoughts) {
			thought.expanded = !expanded;
			changed = true;
		}
	}

	return changed;
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
