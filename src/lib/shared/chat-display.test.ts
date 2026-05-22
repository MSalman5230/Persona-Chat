import { describe, expect, it } from 'vitest';

import {
	applyToolEventToDisplay,
	mergeClientSnapshotThoughtDisplays,
	mergeClientSnapshotTools,
	normalizeChatMessageDisplay,
	overlayStoredDisplay,
	type ChatMessageDisplay
} from './chat-display';

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

	it('accepts name as a toolName fallback for normalized events', () => {
		const display = applyToolEventToDisplay(
			emptyDisplay(),
			{ type: 'tool_execution_start', name: 'mcp_search' },
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

	it('overlays stored display state onto hydrated agent display', () => {
		const display = overlayStoredDisplay(
			{
				role: 'assistant',
				text: 'Done.',
				thoughts: [{ contentIndex: 0, text: 'Thinking', status: 'thought' }],
				tools: [{ contentIndex: 1, id: 'call-1', name: 'search', status: 'pending' }]
			},
			{
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

	it('appends stored-only tools while overlaying stored display', () => {
		const display = overlayStoredDisplay(
			{
				role: 'assistant',
				text: '',
				thoughts: [],
				tools: []
			},
			{
				tools: [
					{
						contentIndex: 0,
						id: 'call-1',
						name: 'mcp_search',
						status: 'running',
						startedAt: 1000
					}
				]
			}
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

	it('keeps completed client tools completed across stale snapshots', () => {
		const tools = mergeClientSnapshotTools(
			[
				{
					contentIndex: 0,
					id: 'call-1',
					name: 'mcp_search',
					status: 'completed',
					startedAt: 1000,
					durationMs: 1500
				}
			],
			[{ contentIndex: 0, id: 'call-1', name: 'mcp_search', status: 'pending' }],
			3000
		);

		expect(tools).toEqual([
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

	it('keeps running client tools running across stale snapshots', () => {
		const tools = mergeClientSnapshotTools(
			[{ contentIndex: 0, id: 'call-1', name: 'mcp_search', status: 'running', startedAt: 1000 }],
			[{ contentIndex: 0, id: 'call-1', name: 'mcp_search', status: 'pending' }],
			3000
		);

		expect(tools).toEqual([
			{
				contentIndex: 0,
				id: 'call-1',
				name: 'mcp_search',
				status: 'running',
				startedAt: 1000
			}
		]);
	});

	it('keeps client-only running tools across pre-persistence snapshots', () => {
		const tools = mergeClientSnapshotTools(
			[{ contentIndex: 0, id: 'call-1', name: 'mcp_search', status: 'running', startedAt: 1000 }],
			[],
			3000
		);

		expect(tools).toEqual([
			{
				contentIndex: 0,
				id: 'call-1',
				name: 'mcp_search',
				status: 'running',
				startedAt: 1000
			}
		]);
	});

	it('keeps incoming snapshot tool order and appends client-only tools', () => {
		const tools = mergeClientSnapshotTools(
			[
				{ contentIndex: 5, id: 'call-client', name: 'mcp_local', status: 'running', startedAt: 1000 },
				{ contentIndex: 0, id: 'call-a', name: 'mcp_a', status: 'completed', durationMs: 500 }
			],
			[
				{ contentIndex: 1, id: 'call-b', name: 'mcp_b', status: 'pending' },
				{ contentIndex: 0, id: 'call-a', name: 'mcp_a', status: 'pending' }
			],
			3000
		);

		expect(tools.map((tool) => tool.id)).toEqual(['call-b', 'call-a', 'call-client']);
		expect(tools[1]).toMatchObject({ id: 'call-a', status: 'completed', durationMs: 500 });
		expect(tools[2]).toMatchObject({ id: 'call-client', status: 'running', startedAt: 1000 });
	});

	it('keeps omitted thinking thoughts across stale snapshots', () => {
		const thoughts = mergeClientSnapshotThoughtDisplays(
			[{ contentIndex: 0, text: 'Still working', status: 'thinking', durationMs: 500 }],
			[]
		);

		expect(thoughts).toEqual([
			{
				contentIndex: 0,
				text: 'Still working',
				status: 'thinking',
				durationMs: 500
			}
		]);
	});

	it('keeps thinking thoughts active when snapshots lack completion duration', () => {
		const thoughts = mergeClientSnapshotThoughtDisplays(
			[{ contentIndex: 0, text: 'Previous', status: 'thinking', durationMs: 500 }],
			[{ contentIndex: 0, text: 'Incoming', status: 'thought' }]
		);

		expect(thoughts).toEqual([
			{
				contentIndex: 0,
				text: 'Incoming',
				status: 'thinking',
				durationMs: 500
			}
		]);
	});

	it('accepts completed thought snapshots when they include duration', () => {
		const thoughts = mergeClientSnapshotThoughtDisplays(
			[{ contentIndex: 0, text: 'Previous', status: 'thinking', durationMs: 500 }],
			[{ contentIndex: 0, text: 'Done', status: 'thought', durationMs: 1200 }]
		);

		expect(thoughts).toEqual([
			{
				contentIndex: 0,
				text: 'Done',
				status: 'thought',
				durationMs: 1200
			}
		]);
	});

	it('normalizes message displays without leaking unknown keys', () => {
		const display = normalizeChatMessageDisplay({
			role: 'assistant',
			text: 'Done.',
			unexpected: true,
			thoughts: [],
			tools: []
		});

		expect(display).toEqual({
			role: 'assistant',
			text: 'Done.',
			thoughts: [],
			tools: []
		});
		expect('unexpected' in display).toBe(false);
	});
});
