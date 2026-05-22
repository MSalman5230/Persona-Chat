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
		const updated = mergeToolEventIntoStoredMessage(
			running,
			{ type: 'tool_execution_update', toolName: 'mcp_search', toolCallId: 'call-1' },
			1500
		);
		const completed = mergeToolEventIntoStoredMessage(
			updated,
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

	it('uses canonical failure and id fallback semantics for stored tool events', () => {
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

		const failed = mergeToolEventIntoStoredMessage(
			message,
			{ type: 'tool_execution_end', toolName: 'mcp_search', isError: true },
			1000
		);

		expect(failed.display?.tools).toEqual([
			{
				contentIndex: 0,
				id: 'mcp_search',
				name: 'mcp_search',
				status: 'failed',
				startedAt: 1000,
				durationMs: 0
			}
		]);
	});
});
