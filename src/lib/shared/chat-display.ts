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

export type ChatDisplayMergeContext =
	| { mode: 'live-event'; event: unknown; now?: number }
	| { mode: 'stored-overlay'; incoming: unknown }
	| { mode: 'client-snapshot-merge'; incoming: unknown; now?: number };

export type ChatThoughtDisplayMergeContext = Extract<
	ChatDisplayMergeContext,
	{ mode: 'stored-overlay' | 'client-snapshot-merge' }
>;

export type ChatToolDisplayMergeContext =
	| Extract<ChatDisplayMergeContext, { mode: 'stored-overlay' | 'client-snapshot-merge' }>
	| Extract<ChatDisplayMergeContext, { mode: 'live-event' }>;

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
		...record,
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

export function mergeChatThoughtDisplay(
	existing: ChatThoughtDisplay | undefined,
	incoming: unknown,
	context: ChatThoughtDisplayMergeContext
): ChatThoughtDisplay | undefined {
	const normalizedIncoming = normalizeChatThoughtDisplay(incoming);

	if (context.mode === 'client-snapshot-merge') return normalizedIncoming;
	if (!existing) return undefined;

	const status = normalizedIncoming?.status === 'thinking' ? 'thinking' : 'thought';
	return {
		...existing,
		status,
		...(normalizedIncoming?.durationMs !== undefined
			? { durationMs: normalizedIncoming.durationMs }
			: {})
	};
}

export function mergeChatDisplayThoughts(
	existingThoughts: unknown,
	incomingThoughts: unknown,
	context: ChatThoughtDisplayMergeContext
): ChatThoughtDisplay[] {
	const existing = normalizeChatThoughtDisplays(existingThoughts);

	if (context.mode === 'client-snapshot-merge') {
		return normalizeChatThoughtDisplays(incomingThoughts).flatMap((thought) => {
			const merged = mergeChatThoughtDisplay(undefined, thought, context);
			return merged ? [merged] : [];
		});
	}

	const incomingByIndex = byContentIndex(normalizeChatThoughtDisplays(incomingThoughts));
	return existing.flatMap((thought) => {
		const merged = mergeChatThoughtDisplay(thought, incomingByIndex.get(thought.contentIndex), context);
		return merged ? [merged] : [];
	});
}

export function mergeChatToolDisplay(
	existing: ChatToolDisplay | undefined,
	incoming: ChatToolDisplay,
	context: ChatToolDisplayMergeContext
): ChatToolDisplay {
	if (context.mode === 'stored-overlay') {
		return {
			contentIndex: existing?.contentIndex ?? incoming.contentIndex,
			id: existing?.id ?? incoming.id,
			name: existing?.name ?? incoming.name,
			status: storedToolStatus(incoming.status),
			...(incoming.startedAt !== undefined ? { startedAt: incoming.startedAt } : {}),
			...(incoming.durationMs !== undefined ? { durationMs: incoming.durationMs } : {})
		};
	}

	if (context.mode === 'client-snapshot-merge') {
		const status = clientSnapshotToolStatus(existing?.status, incoming.status);
		const durationMs = incoming.durationMs ?? existing?.durationMs;
		const now = context.now ?? Date.now();
		const startedAt =
			status === 'running'
				? (existing?.startedAt ?? incoming.startedAt ?? now - (durationMs ?? 0))
				: (incoming.startedAt ?? existing?.startedAt);

		return {
			contentIndex: incoming.contentIndex,
			id: incoming.id,
			name: incoming.name,
			status,
			...(startedAt !== undefined ? { startedAt } : {}),
			...(durationMs !== undefined ? { durationMs } : {})
		};
	}

	const status = incoming.status;
	const now = context.now ?? Date.now();
	const startedAt = existing?.startedAt ?? now;
	const durationMs =
		status === 'running' ? normalizeDisplayDurationMs(existing?.durationMs) : Math.max(0, now - startedAt);

	return {
		contentIndex: existing?.contentIndex ?? incoming.contentIndex,
		id: incoming.id,
		name: incoming.name,
		status,
		startedAt,
		...(durationMs !== undefined ? { durationMs } : {})
	};
}

export function mergeChatDisplayTools(
	existingTools: unknown,
	incomingTools: unknown,
	context: ChatToolDisplayMergeContext
): ChatToolDisplay[] {
	const existing = normalizeChatToolDisplays(existingTools);

	if (context.mode === 'live-event') {
		if (!isRecord(context.event)) return existing;

		const toolName = eventString(context.event, 'toolName') ?? eventString(context.event, 'name');
		if (!toolName) return existing;

		const toolCallId = eventString(context.event, 'toolCallId') ?? toolName;
		const status: ChatToolStatus =
			context.event.type === 'tool_execution_end'
				? context.event.isError === true
					? 'failed'
					: 'completed'
				: 'running';
		const existingIndex = existing.findIndex((tool) => tool.id === toolCallId);
		const previous = existingIndex >= 0 ? existing[existingIndex] : undefined;
		const incoming = createChatToolDisplay({
			contentIndex: previous?.contentIndex ?? existing.length,
			id: toolCallId,
			name: toolName,
			status
		});
		const nextTool = mergeChatToolDisplay(previous, incoming, context);

		return existingIndex >= 0
			? existing.map((tool, index) => (index === existingIndex ? nextTool : tool))
			: [...existing, nextTool];
	}

	const incoming = normalizeChatToolDisplays(
		incomingTools,
		context.mode === 'stored-overlay' ? 'completed' : 'pending'
	);

	if (context.mode === 'client-snapshot-merge') {
		const previousByKey = byToolKey(existing);
		return incoming.map((tool) =>
			mergeChatToolDisplay(
				previousByKey.get(tool.id) ?? previousByKey.get(String(tool.contentIndex)),
				tool,
				context
			)
		);
	}

	const incomingByIndex = byContentIndex(incoming);
	const hydratedToolIndexes = new Set(existing.map((tool) => tool.contentIndex));
	const merged = existing.map((tool) => {
		const incomingTool =
			incomingByIndex.get(tool.contentIndex) ??
			createChatToolDisplay({
				contentIndex: tool.contentIndex,
				id: tool.id,
				name: tool.name,
				status: 'completed'
			});
		return mergeChatToolDisplay(tool, incomingTool, context);
	});
	const storedOnly = incoming.filter((tool) => !hydratedToolIndexes.has(tool.contentIndex));
	return [...merged, ...storedOnly];
}

export function mergeChatMessageDisplay<T extends ChatMessageDisplay>(
	display: T,
	context: ChatDisplayMergeContext
): T {
	if (context.mode === 'live-event') {
		if (!isRecord(context.event)) return display;
		const toolName = eventString(context.event, 'toolName') ?? eventString(context.event, 'name');
		if (!toolName) return display;
		const tools = mergeChatDisplayTools(display.tools, undefined, context);
		if (tools === display.tools) return display;
		return { ...display, tools } as T;
	}

	const incomingRecord = isRecord(context.incoming) ? context.incoming : {};
	const incomingDisplay = normalizeChatMessageDisplay(context.incoming);
	const thoughts = mergeChatDisplayThoughts(display.thoughts, incomingDisplay.thoughts, context);
	const tools = mergeChatDisplayTools(display.tools, incomingDisplay.tools, context);

	return {
		...display,
		...(context.mode === 'client-snapshot-merge'
			? {
					role: typeof incomingRecord.role === 'string' ? incomingDisplay.role : display.role,
					text: typeof incomingRecord.text === 'string' ? incomingDisplay.text : display.text
				}
			: {}),
		thoughts,
		tools
	} as T;
}
