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

export function createChatThoughtDisplay(input: {
	contentIndex: number;
	text?: string;
	status?: unknown;
	durationMs?: unknown;
	redacted?: unknown;
}): ChatThoughtDisplay {
	const redacted = input.redacted === true;
	const durationMs = normalizeDisplayDurationMs(input.durationMs);
	return {
		contentIndex: input.contentIndex,
		text: redacted ? '' : (input.text ?? ''),
		status: input.status === 'thinking' ? 'thinking' : 'thought',
		...(durationMs !== undefined ? { durationMs } : {}),
		...(redacted ? { redacted } : {})
	};
}

export function createChatToolDisplay(input: {
	contentIndex: number;
	id: string;
	name: string;
	status?: unknown;
	statusFallback?: ChatToolStatus;
	startedAt?: unknown;
	durationMs?: unknown;
}): ChatToolDisplay {
	const startedAt = normalizeDisplayTimestamp(input.startedAt);
	const durationMs = normalizeDisplayDurationMs(input.durationMs);
	return {
		contentIndex: input.contentIndex,
		id: input.id,
		name: input.name,
		status: normalizeToolStatus(input.status, input.statusFallback),
		...(startedAt !== undefined ? { startedAt } : {}),
		...(durationMs !== undefined ? { durationMs } : {})
	};
}

export function normalizeChatThoughtDisplay(thought: unknown): ChatThoughtDisplay | undefined {
	if (!isRecord(thought) || typeof thought.contentIndex !== 'number') return undefined;

	return createChatThoughtDisplay({
		contentIndex: thought.contentIndex,
		text: typeof thought.text === 'string' ? thought.text : '',
		status: thought.status,
		durationMs: thought.durationMs,
		redacted: thought.redacted
	});
}

export function normalizeChatToolDisplay(
	tool: unknown,
	statusFallback: ChatToolStatus = 'pending'
): ChatToolDisplay | undefined {
	if (!isRecord(tool) || typeof tool.contentIndex !== 'number') return undefined;
	if (typeof tool.id !== 'string' || typeof tool.name !== 'string') return undefined;

	return createChatToolDisplay({
		contentIndex: tool.contentIndex,
		id: tool.id,
		name: tool.name,
		status: tool.status,
		statusFallback,
		startedAt: tool.startedAt,
		durationMs: tool.durationMs
	});
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
		role: typeof record.role === 'string' ? record.role : (fallback.role ?? ''),
		text: typeof record.text === 'string' ? record.text : (fallback.text ?? ''),
		thoughts: normalizeChatThoughtDisplays(record.thoughts),
		tools: normalizeChatToolDisplays(record.tools)
	};
}

function byContentIndex<T extends { contentIndex: number }>(items: T[]): Map<number, T> {
	return new Map(items.map((item) => [item.contentIndex, item]));
}

function byToolKey(items: ChatToolDisplay[]): Map<string, ChatToolDisplay> {
	const keyed = new Map<string, ChatToolDisplay>();
	for (const tool of items) {
		keyed.set(tool.id || String(tool.contentIndex), tool);
		keyed.set(String(tool.contentIndex), tool);
	}
	return keyed;
}

function storedToolStatus(value: unknown): ChatToolStatus {
	if (value === 'pending' || value === 'running' || value === 'failed') return value;
	return 'completed';
}

function clientSnapshotToolStatus(
	previousStatus: ChatToolStatus | undefined,
	incomingStatus: ChatToolStatus
): ChatToolStatus {
	if (previousStatus === 'running' && incomingStatus === 'pending') return previousStatus;
	if (previousStatus === 'completed' || previousStatus === 'failed') return previousStatus;
	return incomingStatus;
}

function toolEventDisplay(event: unknown): ChatToolDisplay | undefined {
	if (!isRecord(event)) return undefined;

	const name = eventString(event, 'toolName') ?? eventString(event, 'name');
	if (!name) return undefined;

	const id = eventString(event, 'toolCallId') ?? name;
	const status: ChatToolStatus =
		event.type === 'tool_execution_end' ? (event.isError === true ? 'failed' : 'completed') : 'running';

	return createChatToolDisplay({
		contentIndex: 0,
		id,
		name,
		status
	});
}

function applyToolEventToTools(
	tools: ChatToolDisplay[],
	eventTool: ChatToolDisplay,
	now: number
): ChatToolDisplay[] {
	const existingIndex = tools.findIndex((tool) => tool.id === eventTool.id);
	const previous = existingIndex >= 0 ? tools[existingIndex] : undefined;
	const startedAt = previous?.startedAt ?? now;
	const durationMs =
		eventTool.status === 'running'
			? normalizeDisplayDurationMs(previous?.durationMs)
			: Math.max(0, now - startedAt);
	const nextTool: ChatToolDisplay = {
		contentIndex: previous?.contentIndex ?? tools.length,
		id: eventTool.id,
		name: eventTool.name,
		status: eventTool.status,
		startedAt,
		...(durationMs !== undefined ? { durationMs } : {})
	};

	return existingIndex >= 0
		? tools.map((tool, index) => (index === existingIndex ? nextTool : tool))
		: [...tools, nextTool];
}

function overlayStoredThought(
	thought: ChatThoughtDisplay,
	stored: ChatThoughtDisplay | undefined
): ChatThoughtDisplay {
	const status = stored?.status === 'thinking' ? 'thinking' : 'thought';
	return {
		...thought,
		status,
		...(stored?.durationMs !== undefined ? { durationMs: stored.durationMs } : {})
	};
}

function overlayStoredTool(
	tool: ChatToolDisplay | undefined,
	stored: ChatToolDisplay
): ChatToolDisplay {
	return {
		contentIndex: tool?.contentIndex ?? stored.contentIndex,
		id: tool?.id ?? stored.id,
		name: tool?.name ?? stored.name,
		status: storedToolStatus(stored.status),
		...(stored.startedAt !== undefined ? { startedAt: stored.startedAt } : {}),
		...(stored.durationMs !== undefined ? { durationMs: stored.durationMs } : {})
	};
}

function mergeClientSnapshotTool(
	previous: ChatToolDisplay | undefined,
	incoming: ChatToolDisplay,
	now: number
): ChatToolDisplay {
	const status = clientSnapshotToolStatus(previous?.status, incoming.status);
	const durationMs = incoming.durationMs ?? previous?.durationMs;
	const startedAt =
		status === 'running'
			? (previous?.startedAt ?? incoming.startedAt ?? now - (durationMs ?? 0))
			: (incoming.startedAt ?? previous?.startedAt);

	return {
		contentIndex: incoming.contentIndex,
		id: incoming.id,
		name: incoming.name,
		status,
		...(startedAt !== undefined ? { startedAt } : {}),
		...(durationMs !== undefined ? { durationMs } : {})
	};
}

export function applyToolEventToDisplay<T extends ChatMessageDisplay>(
	display: T,
	event: unknown,
	now = Date.now()
): T {
	const eventTool = toolEventDisplay(event);
	if (!eventTool) return display;

	const tools = applyToolEventToTools(display.tools, eventTool, now);
	return { ...display, tools } as T;
}

export function overlayStoredDisplay<T extends ChatMessageDisplay>(
	hydratedDisplay: T,
	storedDisplay: unknown
): T {
	const storedRecord = isRecord(storedDisplay) ? storedDisplay : {};
	const storedThoughts = normalizeChatThoughtDisplays(storedRecord.thoughts);
	const storedTools = normalizeChatToolDisplays(storedRecord.tools, 'completed');
	const storedThoughtsByIndex = byContentIndex(storedThoughts);
	const storedToolsByIndex = byContentIndex(storedTools);
	const hydratedToolIndexes = new Set(hydratedDisplay.tools.map((tool) => tool.contentIndex));
	const thoughts = hydratedDisplay.thoughts.map((thought) =>
		overlayStoredThought(thought, storedThoughtsByIndex.get(thought.contentIndex))
	);
	const tools = [
		...hydratedDisplay.tools.map((tool) =>
			overlayStoredTool(
				tool,
				storedToolsByIndex.get(tool.contentIndex) ??
					createChatToolDisplay({
						contentIndex: tool.contentIndex,
						id: tool.id,
						name: tool.name,
						status: 'completed'
					})
			)
		),
		...storedTools.filter((tool) => !hydratedToolIndexes.has(tool.contentIndex))
	];

	return {
		...hydratedDisplay,
		thoughts,
		tools
	} as T;
}

export function mergeClientSnapshotDisplay<T extends ChatMessageDisplay>(
	existingDisplay: T,
	incomingDisplay: unknown,
	now = Date.now()
): T {
	const incomingRecord = isRecord(incomingDisplay) ? incomingDisplay : {};
	const incoming = normalizeChatMessageDisplay(incomingDisplay);
	const previousToolsByKey = byToolKey(existingDisplay.tools);
	const tools = incoming.tools.map((tool) =>
		mergeClientSnapshotTool(
			previousToolsByKey.get(tool.id) ?? previousToolsByKey.get(String(tool.contentIndex)),
			tool,
			now
		)
	);

	return {
		...existingDisplay,
		...(typeof incomingRecord.role === 'string' ? { role: incoming.role } : {}),
		...(typeof incomingRecord.text === 'string' ? { text: incoming.text } : {}),
		thoughts: incoming.thoughts,
		tools
	} as T;
}
