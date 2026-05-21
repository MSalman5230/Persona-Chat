import type { McpToolCallResult } from './types';

export function normalizeMcpContent(
	content: unknown
): Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> {
	if (!Array.isArray(content)) return [{ type: 'text', text: JSON.stringify(content) ?? '' }];

	return content.map((item) => {
		if (item && typeof item === 'object') {
			const record = item as Record<string, unknown>;
			if (record.type === 'text' && typeof record.text === 'string') {
				return { type: 'text', text: record.text };
			}
			if (
				record.type === 'image' &&
				typeof record.data === 'string' &&
				typeof record.mimeType === 'string'
			) {
				return { type: 'image', data: record.data, mimeType: record.mimeType };
			}
		}

		return { type: 'text', text: JSON.stringify(item) ?? '' };
	});
}

export function mcpErrorMessage(result: McpToolCallResult): string {
	return normalizeMcpContent(result.content)
		.map((item) => ('text' in item ? item.text : `[${item.mimeType} image]`))
		.join('\n');
}

export function jsonToolResult(details: unknown) {
	return {
		content: [{ type: 'text' as const, text: JSON.stringify(details, null, 2) }],
		details
	};
}
