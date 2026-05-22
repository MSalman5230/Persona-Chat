import { describe, expect, it } from 'vitest';

import { mergeChatMessageDisplay, type ChatMessageDisplay } from './chat-display';

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
		const display = mergeChatMessageDisplay(emptyDisplay(), {
			mode: 'live-event',
			event: { type: 'tool_execution_start', toolName: 'mcp_search', toolCallId: 'call-1' },
			now: 1000
		});

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
		const running = mergeChatMessageDisplay(emptyDisplay(), {
			mode: 'live-event',
			event: { type: 'tool_execution_start', toolName: 'mcp_search', toolCallId: 'call-1' },
			now: 1000
		});
		const updated = mergeChatMessageDisplay(running, {
			mode: 'live-event',
			event: { type: 'tool_execution_update', toolName: 'mcp_search', toolCallId: 'call-1' },
			now: 1500
		});

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
		const running = mergeChatMessageDisplay(emptyDisplay(), {
			mode: 'live-event',
			event: { type: 'tool_execution_start', toolName: 'mcp_search', toolCallId: 'call-1' },
			now: 1000
		});
		const completed = mergeChatMessageDisplay(running, {
			mode: 'live-event',
			event: { type: 'tool_execution_end', toolName: 'mcp_search', toolCallId: 'call-1' },
			now: 2500
		});

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
		const running = mergeChatMessageDisplay(emptyDisplay(), {
			mode: 'live-event',
			event: { type: 'tool_execution_start', toolName: 'mcp_search', toolCallId: 'call-1' },
			now: 1000
		});
		const failed = mergeChatMessageDisplay(running, {
			mode: 'live-event',
			event: {
				type: 'tool_execution_end',
				toolName: 'mcp_search',
				toolCallId: 'call-1',
				isError: true
			},
			now: 2500
		});

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
		const display = mergeChatMessageDisplay(emptyDisplay(), {
			mode: 'live-event',
			event: { type: 'tool_execution_start', toolName: 'mcp_search' },
			now: 1000
		});

		expect(display.tools[0]).toMatchObject({
			id: 'mcp_search',
			name: 'mcp_search',
			status: 'running'
		});
	});

	it('leaves the display unchanged when the tool name is missing', () => {
		const display = emptyDisplay();
		const updated = mergeChatMessageDisplay(display, {
			mode: 'live-event',
			event: { type: 'tool_execution_start', toolCallId: 'call-1' },
			now: 1000
		});

		expect(updated).toBe(display);
	});

	it('overlays stored display state onto hydrated agent display', () => {
		const display = mergeChatMessageDisplay(
			{
				role: 'assistant',
				text: 'Done.',
				thoughts: [{ contentIndex: 0, text: 'Thinking', status: 'thought' }],
				tools: [{ contentIndex: 1, id: 'call-1', name: 'search', status: 'pending' }]
			},
			{
				mode: 'stored-overlay',
				incoming: {
					thoughts: [{ contentIndex: 0, status: 'thinking', durationMs: 500 }],
					tools: [
						{
							contentIndex: 1,
							id: 'call-1',
							name: 'search',
							status: 'running',
							startedAt: 1000
						}
					]
				}
			}
		);

		expect(display.thoughts[0]).toMatchObject({
			contentIndex: 0,
			text: 'Thinking',
			status: 'thinking',
			durationMs: 500
		});
		expect(display.tools[0]).toMatchObject({
			contentIndex: 1,
			id: 'call-1',
			status: 'running',
			startedAt: 1000
		});
	});

	it('preserves terminal client tool state across stale snapshots', () => {
		const display = mergeChatMessageDisplay(
			{
				role: 'assistant',
				text: '',
				thoughts: [],
				tools: [
					{
						contentIndex: 0,
						id: 'call-1',
						name: 'search',
						status: 'completed',
						startedAt: 1000,
						durationMs: 1500
					}
				]
			},
			{
				mode: 'client-snapshot-merge',
				incoming: {
					role: 'assistant',
					text: '',
					thoughts: [],
					tools: [{ contentIndex: 0, id: 'call-1', name: 'search', status: 'pending' }]
				},
				now: 3000
			}
		);

		expect(display.tools).toEqual([
			{
				contentIndex: 0,
				id: 'call-1',
				name: 'search',
				status: 'completed',
				startedAt: 1000,
				durationMs: 1500
			}
		]);
	});
});
