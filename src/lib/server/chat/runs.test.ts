import { describe, expect, it } from 'vitest';

import { mergeToolEventIntoStoredMessage } from './runs';

describe('chat run helpers', () => {
	it('merges tool execution progress into a stored assistant message', () => {
		const message = {
			role: 'assistant',
			contentText: '',
			piMessage: { role: 'assistant', content: [] },
			display: {
				role: 'assistant',
				text: '',
				thoughts: [],
				tools: []
			}
		};

		const running = mergeToolEventIntoStoredMessage(
			message,
			{ type: 'tool_execution_start', toolName: 'mcp_search', toolCallId: 'call-1' },
			1000
		);
		const completed = mergeToolEventIntoStoredMessage(
			running,
			{ type: 'tool_execution_end', toolName: 'mcp_search', toolCallId: 'call-1' },
			2500
		);

		expect(completed.display?.tools).toEqual([
			{
				contentIndex: 0,
				id: 'call-1',
				name: 'mcp_search',
				status: 'completed',
				startedAt: 1000,
				durationMs: 1500
			}
		]);
	});
});
