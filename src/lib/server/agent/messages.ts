export type PersistedAgentContentBlock = {
	type: string;
	text?: string;
	thinking?: string;
	data?: string;
	mimeType?: string;
	id?: string;
	name?: string;
	arguments?: Record<string, unknown>;
};

export type PersistedAgentMessage = {
	role: string;
	content?: string | PersistedAgentContentBlock[];
	timestamp?: number;
	api?: unknown;
	provider?: unknown;
	model?: unknown;
	responseModel?: unknown;
	responseId?: unknown;
	diagnostics?: unknown;
	usage?: unknown;
	stopReason?: unknown;
	errorMessage?: unknown;
	toolCallId?: unknown;
	toolName?: unknown;
	details?: unknown;
	isError?: unknown;
};
