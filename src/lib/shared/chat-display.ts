export type ChatToolStatus = 'pending' | 'running' | 'completed' | 'failed';
export type ChatThoughtStatus = 'thinking' | 'thought';

export type ChatThoughtDisplay = {
	contentIndex: number;
	text: string;
	status: ChatThoughtStatus;
	durationMs?: number;
	redacted?: boolean;
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

function eventString(payload: Record<string, unknown>, key: string): string | undefined {
	const value = payload[key];
	return typeof value === 'string' ? value : undefined;
}

export function normalizeDisplayDurationMs(value: unknown): number | undefined {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
	return Math.round(value);
}

export function normalizeDisplayTimestamp(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function isChatToolStatus(value: unknown): value is ChatToolStatus {
	return value === 'pending' || value === 'running' || value === 'completed' || value === 'failed';
}

export function normalizeToolStatus(
	value: unknown,
	fallback: ChatToolStatus = 'pending'
): ChatToolStatus {
	return isChatToolStatus(value) ? value : fallback;
}

export function normalizeStoredToolStatus(value: unknown): ChatToolStatus {
	if (value === 'pending' || value === 'running' || value === 'failed') return value;
	return 'completed';
}

export function mergeToolSnapshotStatus(
	previousStatus: ChatToolStatus | undefined,
	incomingStatus: ChatToolStatus
): ChatToolStatus {
	if (previousStatus === 'running' && incomingStatus === 'pending') return previousStatus;
	if (previousStatus === 'completed' || previousStatus === 'failed') return previousStatus;
	return incomingStatus;
}

export function normalizeChatThoughtDisplay(thought: unknown): ChatThoughtDisplay | undefined {
	if (!isRecord(thought) || typeof thought.contentIndex !== 'number') return undefined;

	const redacted = thought.redacted === true;
	const durationMs = normalizeDisplayDurationMs(thought.durationMs);

	return {
		contentIndex: thought.contentIndex,
		text: redacted ? '' : typeof thought.text === 'string' ? thought.text : '',
		status: thought.status === 'thinking' ? 'thinking' : 'thought',
		...(durationMs !== undefined ? { durationMs } : {}),
		...(redacted ? { redacted } : {})
	};
}

export function normalizeChatToolDisplay(
	tool: unknown,
	statusFallback: ChatToolStatus = 'pending'
): ChatToolDisplay | undefined {
	if (!isRecord(tool) || typeof tool.contentIndex !== 'number') return undefined;
	if (typeof tool.id !== 'string' || typeof tool.name !== 'string') return undefined;

	const startedAt = normalizeDisplayTimestamp(tool.startedAt);
	const durationMs = normalizeDisplayDurationMs(tool.durationMs);

	return {
		contentIndex: tool.contentIndex,
		id: tool.id,
		name: tool.name,
		status: normalizeToolStatus(tool.status, statusFallback),
		...(startedAt !== undefined ? { startedAt } : {}),
		...(durationMs !== undefined ? { durationMs } : {})
	};
}

export function normalizeChatThoughtDisplays(thoughts: unknown): ChatThoughtDisplay[] {
	if (!Array.isArray(thoughts)) return [];
	return thoughts.flatMap((thought): ChatThoughtDisplay[] => {
		const normalized = normalizeChatThoughtDisplay(thought);
		return normalized ? [normalized] : [];
	});
}

export function normalizeChatToolDisplays(
	tools: unknown,
	statusFallback: ChatToolStatus = 'pending'
): ChatToolDisplay[] {
	if (!Array.isArray(tools)) return [];
	return tools.flatMap((tool): ChatToolDisplay[] => {
		const normalized = normalizeChatToolDisplay(tool, statusFallback);
		return normalized ? [normalized] : [];
	});
}

export function normalizeChatMessageDisplay(
	display: unknown,
	fallback: Partial<Pick<ChatMessageDisplay, 'role' | 'text'>> = {}
): ChatMessageDisplay {
	const record = isRecord(display) ? display : {};

	return {
		...record,
		role: typeof record.role === 'string' ? record.role : (fallback.role ?? ''),
		text: typeof record.text === 'string' ? record.text : (fallback.text ?? ''),
		thoughts: normalizeChatThoughtDisplays(record.thoughts),
		tools: normalizeChatToolDisplays(record.tools)
	};
}

export function applyToolEventToDisplay<T extends ChatMessageDisplay>(
	display: T,
	event: unknown,
	now = Date.now()
): T {
	if (!isRecord(event)) return display;

	const toolName = eventString(event, 'toolName') ?? eventString(event, 'name');
	if (!toolName) return display;

	const toolCallId = eventString(event, 'toolCallId') ?? toolName;
	const status: ChatToolStatus =
		event.type === 'tool_execution_end'
			? event.isError === true
				? 'failed'
				: 'completed'
			: 'running';
	const existingTools = normalizeChatToolDisplays(display.tools);
	const existingIndex = existingTools.findIndex((tool) => tool.id === toolCallId);
	const previous = existingIndex >= 0 ? existingTools[existingIndex] : undefined;
	const startedAt = normalizeDisplayTimestamp(previous?.startedAt) ?? now;
	const durationMs =
		status === 'running'
			? normalizeDisplayDurationMs(previous?.durationMs)
			: Math.max(0, now - startedAt);
	const nextTool: ChatToolDisplay = {
		contentIndex: previous?.contentIndex ?? existingTools.length,
		id: toolCallId,
		name: toolName,
		status,
		startedAt,
		...(durationMs !== undefined ? { durationMs } : {})
	};
	const tools =
		existingIndex >= 0
			? existingTools.map((tool, index) => (index === existingIndex ? nextTool : tool))
			: [...existingTools, nextTool];

	return {
		...display,
		tools
	} as T;
}
