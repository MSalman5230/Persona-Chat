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

function isTerminalToolStatus(status: ChatToolStatus): boolean {
	return status === 'completed' || status === 'failed';
}

export function reconcileToolStatus(
	incomingStatus: ChatToolStatus,
	previousStatus?: ChatToolStatus
): ChatToolStatus {
	if (isTerminalToolStatus(incomingStatus)) return incomingStatus;
	if (incomingStatus === 'pending' && previousStatus && previousStatus !== 'pending') {
		return previousStatus;
	}

	return incomingStatus;
}

type ToolStatusMergeMode = 'previous' | 'reconcile';

function toolMergeStatus(
	incomingStatus: ChatToolStatus,
	previousStatus: ChatToolStatus | undefined,
	mode: ToolStatusMergeMode
): ChatToolStatus {
	return mode === 'previous'
		? (previousStatus ?? incomingStatus)
		: reconcileToolStatus(incomingStatus, previousStatus);
}

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

function toolStatusFromValue(value: unknown, fallback: ChatToolStatus): ChatToolStatus {
	if (value === 'running' || value === 'completed' || value === 'failed' || value === 'pending') {
		return value;
	}

	return fallback;
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

function normalizeChatToolDisplay(
	value: unknown,
	statusFallback: ChatToolStatus
): ChatToolDisplay | undefined {
	if (!isRecord(value) || typeof value.contentIndex !== 'number') return undefined;
	if (typeof value.id !== 'string' || typeof value.name !== 'string') return undefined;

	const startedAt = finiteNumber(value.startedAt);
	const durationMs = roundedDurationMs(value.durationMs);

	return {
		contentIndex: value.contentIndex,
		id: value.id,
		name: value.name,
		status: toolStatusFromValue(value.status, statusFallback),
		...(startedAt !== undefined ? { startedAt } : {}),
		...(durationMs !== undefined ? { durationMs } : {})
	};
}

export function normalizeChatMessageDisplay(
	value: unknown,
	options: { toolStatusFallback?: ChatToolStatus } = {}
): ChatMessageDisplay {
	const display = isRecord(value) ? value : {};
	const toolStatusFallback = options.toolStatusFallback ?? 'pending';
	const thoughts = Array.isArray(display.thoughts)
		? display.thoughts.flatMap((thought): ChatThoughtDisplay[] => {
				const normalized = normalizeChatThoughtDisplay(thought);
				return normalized ? [normalized] : [];
			})
		: [];
	const tools = Array.isArray(display.tools)
		? display.tools.flatMap((tool): ChatToolDisplay[] => {
				const normalized = normalizeChatToolDisplay(tool, toolStatusFallback);
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
	const stored = normalizeChatMessageDisplay(storedDisplay, { toolStatusFallback: 'completed' });
	const storedThoughts = new Map(stored.thoughts.map((thought) => [thought.contentIndex, thought]));
	const thoughts = display.thoughts.map((thought) => {
		const storedThought = storedThoughts.get(thought.contentIndex);
		if (!storedThought) return thought;

		return {
			...thought,
			status: storedThought.status,
			...(storedThought.durationMs !== undefined ? { durationMs: storedThought.durationMs } : {})
		};
	});

	return {
		...display,
		thoughts,
		tools: mergeChatToolDisplays(display.tools, stored.tools, {
			appendPreviousOnly: true,
			statusMergeMode: 'previous'
		})
	};
}

export function mergeChatToolDisplays(
	incomingTools: ChatToolDisplay[],
	previousTools: ChatToolDisplay[],
	options: {
		appendPreviousOnly?: boolean;
		now?: number;
		statusMergeMode?: ToolStatusMergeMode;
	} = {}
): ChatToolDisplay[] {
	const statusMergeMode = options.statusMergeMode ?? 'reconcile';
	const previousById = new Map(previousTools.map((tool) => [tool.id, tool]));
	const previousByIndex = new Map(previousTools.map((tool) => [tool.contentIndex, tool]));
	const matchedPrevious = new Set<ChatToolDisplay>();

	const tools = incomingTools.map((tool) => {
		const previous = previousById.get(tool.id) ?? previousByIndex.get(tool.contentIndex);
		if (previous) matchedPrevious.add(previous);

		const status = toolMergeStatus(tool.status, previous?.status, statusMergeMode);
		const durationMs = tool.durationMs ?? previous?.durationMs;
		const startedAt =
			tool.startedAt ??
			previous?.startedAt ??
			(status === 'running' && options.now !== undefined
				? options.now - (durationMs ?? 0)
				: undefined);

		return {
			...tool,
			status,
			...(startedAt !== undefined ? { startedAt } : {}),
			...(durationMs !== undefined ? { durationMs } : {})
		};
	});

	if (options.appendPreviousOnly === true) {
		for (const previous of previousTools) {
			if (!matchedPrevious.has(previous) && !tools.some((tool) => tool.id === previous.id)) {
				tools.push(previous);
			}
		}
	}

	return tools;
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
