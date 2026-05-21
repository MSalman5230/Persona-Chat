export const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const;
export const CHAT_THINKING_OPTIONS = ['auto', ...THINKING_LEVELS] as const;

export type ThinkingLevel = (typeof THINKING_LEVELS)[number];
export type ChatThinkingSelection = (typeof CHAT_THINKING_OPTIONS)[number];

export function isThinkingLevel(value: unknown): value is ThinkingLevel {
	return typeof value === 'string' && THINKING_LEVELS.includes(value as ThinkingLevel);
}

export function chatThinkingSelectionFromServer(value: unknown): ChatThinkingSelection {
	return isThinkingLevel(value) ? value : 'auto';
}

export function thinkingLevelForRequest(selection: ChatThinkingSelection): ThinkingLevel | null {
	return selection === 'auto' ? null : selection;
}
