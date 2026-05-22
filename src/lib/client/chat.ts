import {
	applyToolEvent,
	mergeChatToolDisplays,
	normalizeChatMessageDisplay,
	type ChatToolDisplay
} from '$lib/shared/chat-display';

export type UiThought = {
	contentIndex: number;
	text: string;
	status: 'thinking' | 'thought';
	durationMs?: number;
	redacted: boolean;
	expanded: boolean;
	startedAt?: number;
};

export type UiTool = ChatToolDisplay;

export type UiMessage = {
	role: 'user' | 'assistant' | 'tool' | 'system';
	text: string;
	thoughts: UiThought[];
	tools: UiTool[];
	toolName?: string;
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
	return typeof value === 'number' && Number.isFinite(value) && value >= 0
		? Math.round(value)
		: undefined;
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

	return thoughts.flatMap((thought): UiThought[] => {
		if (!isRecord(thought) || typeof thought.contentIndex !== 'number') return [];

		const previous = previousByIndex.get(thought.contentIndex);
		const status = thought.status === 'thinking' ? 'thinking' : 'thought';
		const durationMs = durationFromServer(thought.durationMs);
		const wasThinking = previous?.status === 'thinking';
		const expanded =
			status === 'thinking' ? true : wasThinking ? false : (previous?.expanded ?? false);
		const startedAt =
			status === 'thinking' ? (previous?.startedAt ?? now - (durationMs ?? 0)) : undefined;
		const redacted = thought.redacted === true;

		return [
			{
				contentIndex: thought.contentIndex,
				text: redacted ? '' : typeof thought.text === 'string' ? thought.text : '',
				status,
				...(durationMs !== undefined ? { durationMs } : {}),
				redacted,
				expanded,
				...(startedAt !== undefined ? { startedAt } : {})
			}
		];
	});
}

export function normalizeServerTools(
	tools: unknown,
	existingTools: UiTool[] = [],
	now = Date.now()
): UiTool[] {
	const incomingTools = normalizeChatMessageDisplay({
		role: 'assistant',
		text: '',
		thoughts: [],
		tools: Array.isArray(tools) ? tools : []
	}).tools;
	return mergeChatToolDisplays(incomingTools, existingTools, { now });
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
		...(typeof payload.toolName === 'string' ? { toolName: payload.toolName } : {})
	};
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
	const display = {
		role: current.role,
		text: current.text,
		thoughts: current.thoughts,
		tools: current.tools
	};
	const nextDisplay = applyToolEvent(display, payload, now);
	if (nextDisplay === display) return current;

	return { ...current, tools: nextDisplay.tools };
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
