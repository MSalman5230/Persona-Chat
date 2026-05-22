export type ChatThoughtDisplay = {
	contentIndex: number;
	text: string;
	status: 'thinking' | 'thought';
	durationMs?: number;
	redacted?: boolean;
};

export type ChatToolStatus = 'pending' | 'running' | 'completed' | 'failed';

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

function finiteNumber(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function roundedDurationMs(value: unknown): number | undefined {
	const duration = finiteNumber(value);
	return duration === undefined ? undefined : Math.round(duration);
}

function toolStatusFromValue(value: unknown): ChatToolStatus {
	if (value === 'running' || value === 'completed' || value === 'failed' || value === 'pending') {
		return value;
	}

	return 'pending';
}

function normalizeChatThoughtDisplay(value: unknown): ChatThoughtDisplay | undefined {
	if (!isRecord(value) || typeof value.contentIndex !== 'number') return undefined;

	const durationMs = roundedDurationMs(value.durationMs);
	const redacted = value.redacted === true;

	return {
		contentIndex: value.contentIndex,
		text: redacted ? '' : typeof value.text === 'string' ? value.text : '',
		status: value.status === 'thinking' ? 'thinking' : 'thought',
		...(durationMs !== undefined ? { durationMs } : {}),
		...(redacted ? { redacted: true } : {})
	};
}

function normalizeChatToolDisplay(value: unknown): ChatToolDisplay | undefined {
	if (!isRecord(value) || typeof value.contentIndex !== 'number') return undefined;
	if (typeof value.id !== 'string' || typeof value.name !== 'string') return undefined;

	const startedAt = finiteNumber(value.startedAt);
	const durationMs = roundedDurationMs(value.durationMs);

	return {
		contentIndex: value.contentIndex,
		id: value.id,
		name: value.name,
		status: toolStatusFromValue(value.status),
		...(startedAt !== undefined ? { startedAt } : {}),
		...(durationMs !== undefined ? { durationMs } : {})
	};
}

export function normalizeChatMessageDisplay(value: unknown): ChatMessageDisplay {
	const display = isRecord(value) ? value : {};
	const thoughts = Array.isArray(display.thoughts)
		? display.thoughts.flatMap((thought): ChatThoughtDisplay[] => {
				const normalized = normalizeChatThoughtDisplay(thought);
				return normalized ? [normalized] : [];
			})
		: [];
	const tools = Array.isArray(display.tools)
		? display.tools.flatMap((tool): ChatToolDisplay[] => {
				const normalized = normalizeChatToolDisplay(tool);
				return normalized ? [normalized] : [];
			})
		: [];

	return {
		role: typeof display.role === 'string' ? display.role : '',
		text: typeof display.text === 'string' ? display.text : '',
		thoughts,
		tools
	};
}

export function mergeStoredChatMessageDisplayState(
	display: ChatMessageDisplay,
	storedDisplay: unknown
): ChatMessageDisplay {
	const stored = normalizeChatMessageDisplay(storedDisplay);
	const storedThoughts = new Map(stored.thoughts.map((thought) => [thought.contentIndex, thought]));
	const storedToolsById = new Map(stored.tools.map((tool) => [tool.id, tool]));
	const storedToolsByIndex = new Map(stored.tools.map((tool) => [tool.contentIndex, tool]));
	const usedStoredToolIds = new Set<string>();

	const thoughts = display.thoughts.map((thought) => {
		const storedThought = storedThoughts.get(thought.contentIndex);
		if (!storedThought) return thought;

		return {
			...thought,
			status: storedThought.status,
			...(storedThought.durationMs !== undefined ? { durationMs: storedThought.durationMs } : {})
		};
	});

	const tools = display.tools.map((tool) => {
		const storedTool = storedToolsById.get(tool.id) ?? storedToolsByIndex.get(tool.contentIndex);
		if (!storedTool) return tool;
		usedStoredToolIds.add(storedTool.id);

		return {
			...tool,
			status: storedTool.status,
			...(storedTool.startedAt !== undefined ? { startedAt: storedTool.startedAt } : {}),
			...(storedTool.durationMs !== undefined ? { durationMs: storedTool.durationMs } : {})
		};
	});

	for (const storedTool of stored.tools) {
		if (!usedStoredToolIds.has(storedTool.id) && !tools.some((tool) => tool.id === storedTool.id)) {
			tools.push(storedTool);
		}
	}

	return {
		...display,
		thoughts,
		tools
	};
}

export function applyToolEvent(
	display: ChatMessageDisplay,
	event: Record<string, unknown>,
	now = Date.now()
): ChatMessageDisplay {
	if (typeof event.toolName !== 'string') return display;

	const normalized = normalizeChatMessageDisplay(display);
	const toolCallId = typeof event.toolCallId === 'string' ? event.toolCallId : event.toolName;
	const existingIndex = normalized.tools.findIndex((tool) => tool.id === toolCallId);
	const previous = existingIndex >= 0 ? normalized.tools[existingIndex] : undefined;
	const status: ChatToolStatus =
		event.type === 'tool_execution_end'
			? event.isError === true
				? 'failed'
				: 'completed'
			: 'running';
	const startedAt = previous?.startedAt ?? now;
	const durationMs =
		status === 'running' ? previous?.durationMs : Math.max(0, Math.round(now - startedAt));
	const nextTool: ChatToolDisplay = {
		contentIndex: previous?.contentIndex ?? normalized.tools.length,
		id: toolCallId,
		name: event.toolName,
		status,
		startedAt,
		...(durationMs !== undefined ? { durationMs } : {})
	};
	const tools =
		existingIndex >= 0
			? normalized.tools.map((tool, index) => (index === existingIndex ? nextTool : tool))
			: [...normalized.tools, nextTool];

	return {
		...normalized,
		tools
	};
}
