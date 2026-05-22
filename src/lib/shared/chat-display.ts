export type ChatThoughtStatus = 'thinking' | 'thought';
export type ChatToolStatus = 'pending' | 'running' | 'completed' | 'failed';

export type ChatThoughtDisplay = {
	contentIndex: number;
	text: string;
	status: ChatThoughtStatus;
	durationMs?: number;
	redacted?: boolean;
	startedAt?: number;
};

export type ChatToolDisplay = {
	contentIndex: number;
	id: string;
	name: string;
	status: ChatToolStatus;
	startedAt?: number;
	durationMs?: number;
};

export type ChatMessageDisplay = {
	role: string;
	text: string;
	thoughts: ChatThoughtDisplay[];
	tools: ChatToolDisplay[];
};

type ChatDisplayFallback = {
	role?: string;
	text?: string;
};

type MergeChatDisplayOptions = {
	missingToolStatus?: ChatToolStatus;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function roundedDurationMs(value: unknown): number | undefined {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
	return Math.round(value);
}

function nonNegativeNumber(value: unknown): number | undefined {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
	return value;
}

function contentIndexFrom(value: unknown): number | undefined {
	if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
	return value;
}

function normalizeThoughtStatus(value: unknown): ChatThoughtStatus {
	return value === 'thinking' ? 'thinking' : 'thought';
}

function normalizeToolStatus(value: unknown): ChatToolStatus {
	if (value === 'running' || value === 'completed' || value === 'failed' || value === 'pending') {
		return value;
	}

	return 'pending';
}

function isTerminalToolStatus(status: ChatToolStatus): boolean {
	return status === 'completed' || status === 'failed';
}

export function normalizeChatThoughts(thoughts: unknown): ChatThoughtDisplay[] {
	if (!Array.isArray(thoughts)) return [];

	return thoughts.flatMap((thought): ChatThoughtDisplay[] => {
		if (!isRecord(thought)) return [];
		const contentIndex = contentIndexFrom(thought.contentIndex);
		if (contentIndex === undefined) return [];

		const redacted = thought.redacted === true;
		const durationMs = roundedDurationMs(thought.durationMs);
		const startedAt = nonNegativeNumber(thought.startedAt);

		return [
			{
				contentIndex,
				text: redacted ? '' : typeof thought.text === 'string' ? thought.text : '',
				status: normalizeThoughtStatus(thought.status),
				...(durationMs !== undefined ? { durationMs } : {}),
				...(redacted ? { redacted: true } : {}),
				...(startedAt !== undefined ? { startedAt } : {})
			}
		];
	});
}

export function normalizeChatTools(tools: unknown): ChatToolDisplay[] {
	if (!Array.isArray(tools)) return [];

	return tools.flatMap((tool): ChatToolDisplay[] => {
		if (!isRecord(tool)) return [];
		const contentIndex = contentIndexFrom(tool.contentIndex);
		if (contentIndex === undefined || typeof tool.id !== 'string' || typeof tool.name !== 'string') {
			return [];
		}

		const startedAt = nonNegativeNumber(tool.startedAt);
		const durationMs = roundedDurationMs(tool.durationMs);

		return [
			{
				contentIndex,
				id: tool.id,
				name: tool.name,
				status: normalizeToolStatus(tool.status),
				...(startedAt !== undefined ? { startedAt } : {}),
				...(durationMs !== undefined ? { durationMs } : {})
			}
		];
	});
}

export function normalizeChatMessageDisplay(
	display: unknown,
	fallback: ChatDisplayFallback = {}
): ChatMessageDisplay {
	const record = isRecord(display) ? display : {};

	return {
		role: typeof record.role === 'string' ? record.role : (fallback.role ?? ''),
		text: typeof record.text === 'string' ? record.text : (fallback.text ?? ''),
		thoughts: normalizeChatThoughts(record.thoughts),
		tools: normalizeChatTools(record.tools)
	};
}

function thoughtByIndex(thoughts: ChatThoughtDisplay[]): Map<number, ChatThoughtDisplay> {
	return new Map(thoughts.map((thought) => [thought.contentIndex, thought]));
}

function toolKeys(tool: ChatToolDisplay): string[] {
	return [tool.id, String(tool.contentIndex)].filter((key) => key.length > 0);
}

function toolsByKey(tools: ChatToolDisplay[]): Map<string, ChatToolDisplay> {
	const result = new Map<string, ChatToolDisplay>();
	for (const tool of tools) {
		for (const key of toolKeys(tool)) result.set(key, tool);
	}
	return result;
}

function mergeThoughtDisplay(
	base: ChatThoughtDisplay,
	stored: ChatThoughtDisplay | undefined
): ChatThoughtDisplay {
	const storedIsAuthoritativeThinking =
		stored?.status === 'thinking' && base.status === 'thought' && base.durationMs === undefined;
	const status = storedIsAuthoritativeThinking ? 'thinking' : base.status;
	const durationMs = base.durationMs ?? stored?.durationMs;
	const startedAt = status === 'thinking' ? (stored?.startedAt ?? base.startedAt) : undefined;

	return {
		...base,
		status,
		...(durationMs !== undefined ? { durationMs } : {}),
		...(startedAt !== undefined ? { startedAt } : {})
	};
}

function mergedToolStatus(
	base: ChatToolDisplay,
	stored: ChatToolDisplay | undefined,
	missingToolStatus: ChatToolStatus | undefined
): ChatToolStatus {
	if (stored && isTerminalToolStatus(stored.status)) return stored.status;
	if (isTerminalToolStatus(base.status)) return base.status;
	if (stored?.status === 'running' && base.status === 'pending') return 'running';
	if (!stored && missingToolStatus) return missingToolStatus;
	return base.status;
}

function mergeToolDisplay(
	base: ChatToolDisplay,
	stored: ChatToolDisplay | undefined,
	missingToolStatus: ChatToolStatus | undefined
): ChatToolDisplay {
	const status = mergedToolStatus(base, stored, missingToolStatus);
	const startedAt = stored?.startedAt ?? base.startedAt;
	const durationMs = base.durationMs ?? stored?.durationMs;

	return {
		contentIndex: base.contentIndex,
		id: base.id,
		name: base.name,
		status,
		...(startedAt !== undefined ? { startedAt } : {}),
		...(durationMs !== undefined ? { durationMs } : {})
	};
}

export function mergeToolDisplays(
	baseToolsInput: unknown,
	storedToolsInput: unknown,
	options: MergeChatDisplayOptions = {}
): ChatToolDisplay[] {
	const baseTools = normalizeChatTools(baseToolsInput);
	const storedTools = normalizeChatTools(storedToolsInput);
	const storedToolsByKey = toolsByKey(storedTools);
	const mergedTools = baseTools.map((tool) =>
		mergeToolDisplay(
			tool,
			storedToolsByKey.get(tool.id) ?? storedToolsByKey.get(String(tool.contentIndex)),
			options.missingToolStatus
		)
	);
	const mergedToolKeys = new Set(mergedTools.flatMap(toolKeys));
	const storedOnlyTools = storedTools.filter((tool) =>
		toolKeys(tool).every((key) => !mergedToolKeys.has(key))
	);

	return [...mergedTools, ...storedOnlyTools];
}

export function mergeLiveDisplay(
	baseDisplay: unknown,
	storedDisplay: unknown,
	options: MergeChatDisplayOptions = {}
): ChatMessageDisplay {
	const base = normalizeChatMessageDisplay(baseDisplay);
	const stored = normalizeChatMessageDisplay(storedDisplay, {
		role: base.role,
		text: base.text
	});
	const storedThoughts = thoughtByIndex(stored.thoughts);

	return {
		role: base.role,
		text: base.text,
		thoughts: base.thoughts.map((thought) =>
			mergeThoughtDisplay(thought, storedThoughts.get(thought.contentIndex))
		),
		tools: mergeToolDisplays(base.tools, stored.tools, options)
	};
}

export function hydrateStoredDisplay(baseDisplay: unknown, storedDisplay: unknown): ChatMessageDisplay {
	return mergeLiveDisplay(baseDisplay, storedDisplay, { missingToolStatus: 'completed' });
}

function eventString(payload: Record<string, unknown>, key: string): string | undefined {
	const value = payload[key];
	return typeof value === 'string' ? value : undefined;
}

function eventBoolean(payload: Record<string, unknown>, key: string): boolean | undefined {
	const value = payload[key];
	return typeof value === 'boolean' ? value : undefined;
}

function toolStatusFromEvent(payload: Record<string, unknown>): ChatToolStatus | undefined {
	if (payload.type === 'tool_execution_end') {
		return eventBoolean(payload, 'isError') === true ? 'failed' : 'completed';
	}

	if (payload.type === 'tool_execution_start' || payload.type === 'tool_execution_update') {
		return 'running';
	}
}

function nextToolContentIndex(display: ChatMessageDisplay): number {
	const indexes = [...display.thoughts, ...display.tools].map((item) => item.contentIndex);
	return indexes.length === 0 ? 0 : Math.max(...indexes) + 1;
}

export function applyToolEvent(
	displayInput: unknown,
	event: unknown,
	now = Date.now()
): ChatMessageDisplay {
	const display = normalizeChatMessageDisplay(displayInput);
	if (!isRecord(event)) return display;

	const toolName = eventString(event, 'toolName') ?? eventString(event, 'name');
	const incomingStatus = toolStatusFromEvent(event);
	if (!toolName || !incomingStatus) return display;

	const toolCallId = eventString(event, 'toolCallId') ?? toolName;
	const existingIndex = display.tools.findIndex((tool) => tool.id === toolCallId);
	const previous = existingIndex >= 0 ? display.tools[existingIndex] : undefined;
	const status =
		previous && isTerminalToolStatus(previous.status) && incomingStatus === 'running'
			? previous.status
			: incomingStatus;
	const startedAt = previous?.startedAt ?? now;
	const durationMs = isTerminalToolStatus(status)
		? (previous?.durationMs ?? Math.max(0, Math.round(now - startedAt)))
		: previous?.durationMs;
	const nextTool: ChatToolDisplay = {
		contentIndex: previous?.contentIndex ?? nextToolContentIndex(display),
		id: toolCallId,
		name: toolName,
		status,
		startedAt,
		...(durationMs !== undefined ? { durationMs } : {})
	};
	const tools =
		existingIndex >= 0
			? display.tools.map((tool, index) => (index === existingIndex ? nextTool : tool))
			: [...display.tools, nextTool];

	return {
		...display,
		tools
	};
}
