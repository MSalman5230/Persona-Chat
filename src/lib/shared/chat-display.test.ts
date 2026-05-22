import { describe, expect, it } from 'vitest';

import { applyToolEventToDisplay, type ChatMessageDisplay } from './chat-display';

function emptyDisplay(): ChatMessageDisplay {
	return {
		role: 'assistant',
		text: '',
		thoughts: [],
		tools: []
	};
}

describe('chat display helpers', () => {
	it('creates a running tool from a start event', () => {
		const display = applyToolEventToDisplay(
			emptyDisplay(),
			{ type: 'tool_execution_start', toolName: 'mcp_search', toolCallId: 'call-1' },
			1000
		);

		expect(display.tools).toEqual([
			{
				contentIndex: 0,
				id: 'call-1',
				name: 'mcp_search',
				status: 'running',
				startedAt: 1000
			}
		]);
	});

	it('keeps an updated tool running', () => {
		const running = applyToolEventToDisplay(
			emptyDisplay(),
			{ type: 'tool_execution_start', toolName: 'mcp_search', toolCallId: 'call-1' },
			1000
		);
		const updated = applyToolEventToDisplay(
			running,
			{ type: 'tool_execution_update', toolName: 'mcp_search', toolCallId: 'call-1' },
			1500
		);

		expect(updated.tools).toEqual([
			{
				contentIndex: 0,
				id: 'call-1',
				name: 'mcp_search',
				status: 'running',
				startedAt: 1000
			}
		]);
	});

	it('completes a successful tool with duration', () => {
		const running = applyToolEventToDisplay(
			emptyDisplay(),
			{ type: 'tool_execution_start', toolName: 'mcp_search', toolCallId: 'call-1' },
			1000
		);
		const completed = applyToolEventToDisplay(
			running,
			{ type: 'tool_execution_end', toolName: 'mcp_search', toolCallId: 'call-1' },
			2500
		);

		expect(completed.tools).toEqual([
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

	it('marks an errored tool as failed with duration', () => {
		const running = applyToolEventToDisplay(
			emptyDisplay(),
			{ type: 'tool_execution_start', toolName: 'mcp_search', toolCallId: 'call-1' },
			1000
		);
		const failed = applyToolEventToDisplay(
			running,
			{
				type: 'tool_execution_end',
				toolName: 'mcp_search',
				toolCallId: 'call-1',
				isError: true
			},
			2500
		);

		expect(failed.tools).toEqual([
			{
				contentIndex: 0,
				id: 'call-1',
				name: 'mcp_search',
				status: 'failed',
				startedAt: 1000,
				durationMs: 1500
			}
		]);
	});

	it('falls back to the tool name when the call id is missing', () => {
		const display = applyToolEventToDisplay(
			emptyDisplay(),
			{ type: 'tool_execution_start', toolName: 'mcp_search' },
			1000
		);

		expect(display.tools[0]).toMatchObject({
			id: 'mcp_search',
			name: 'mcp_search',
			status: 'running'
		});
	});

	it('leaves the display unchanged when the tool name is missing', () => {
		const display = emptyDisplay();
		const updated = applyToolEventToDisplay(
			display,
			{ type: 'tool_execution_start', toolCallId: 'call-1' },
			1000
		);

		expect(updated).toBe(display);
	});
});
