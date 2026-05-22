import { describe, expect, it } from 'vitest';

import {
	applyToolEvent,
	mergeStoredChatMessageDisplayState,
	normalizeChatMessageDisplay,
	type ChatMessageDisplay
} from './chat-display';

const emptyDisplay: ChatMessageDisplay = {
	role: 'assistant',
	text: '',
	thoughts: [],
	tools: []
};

describe('chat display helpers', () => {
	it('applies canonical tool event status transitions', () => {
		const started = applyToolEvent(
			emptyDisplay,
			{ type: 'tool_execution_start', toolName: 'mcp_search', toolCallId: 'call-1' },
			1000
		);
		const updated = applyToolEvent(
			started,
			{ type: 'tool_execution_update', toolName: 'mcp_search', toolCallId: 'call-1' },
			1500
		);
		const completed = applyToolEvent(
			updated,
			{ type: 'tool_execution_end', toolName: 'mcp_search', toolCallId: 'call-1' },
			2500
		);

		expect(started.tools[0]).toMatchObject({
			contentIndex: 0,
			id: 'call-1',
			name: 'mcp_search',
			status: 'running',
			startedAt: 1000
		});
		expect(updated.tools[0]).toMatchObject({
			status: 'running',
			startedAt: 1000
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

	it('marks failed tool executions and falls back to tool name as id', () => {
		const failed = applyToolEvent(
			emptyDisplay,
			{ type: 'tool_execution_end', toolName: 'mcp_search', isError: true },
			1000
		);

		expect(failed.tools).toEqual([
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

	it('normalizes stored display timing metadata', () => {
		expect(
			normalizeChatMessageDisplay({
				role: 'assistant',
				text: 'Done',
				thoughts: [],
				tools: [
					{
						contentIndex: 0,
						id: 'call-1',
						name: 'mcp_search',
						status: 'completed',
						startedAt: 1000,
						durationMs: 1500.4
					}
				]
			}).tools
		).toEqual([
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

	it('uses pending as the canonical unknown tool status fallback', () => {
		expect(
			normalizeChatMessageDisplay({
				role: 'assistant',
				text: '',
				thoughts: [],
				tools: [{ contentIndex: 0, id: 'call-1', name: 'mcp_search', status: 'weird' }]
			}).tools[0]?.status
		).toBe('pending');
	});

	it('uses completed as the persisted stored-state unknown tool status fallback', () => {
		const merged = mergeStoredChatMessageDisplayState(
			{
				role: 'assistant',
				text: '',
				thoughts: [],
				tools: [{ contentIndex: 0, id: 'call-1', name: 'mcp_search', status: 'pending' }]
			},
			{
				tools: [{ contentIndex: 0, id: 'call-1', name: 'mcp_search', status: 'weird' }]
			}
		);

		expect(merged.tools[0]?.status).toBe('completed');
	});
});
