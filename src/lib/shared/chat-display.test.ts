import { describe, expect, it } from 'vitest';

import {
	applyToolEvent,
	mergeChatMessageDisplay,
	normalizeChatMessageDisplay
} from './chat-display';

describe('chat display helpers', () => {
	it('normalizes display payloads and drops invalid timing metadata', () => {
		expect(
			normalizeChatMessageDisplay(
				{
					role: 'assistant',
					text: 42,
					thoughts: [
						{ contentIndex: 0, text: 'plan', status: 'unknown', durationMs: 12.6 },
						{ contentIndex: 1, text: 'secret', redacted: true, startedAt: -1 },
						{ text: 'missing index' }
					],
					tools: [
						{
							contentIndex: 2,
							id: 'call-1',
							name: 'mcp_search',
							status: 'mystery',
							durationMs: -1
						},
						{ contentIndex: 3, id: 'call-2' }
					]
				},
				{ text: 'fallback' }
			)
		).toEqual({
			role: 'assistant',
			text: 'fallback',
			thoughts: [
				{ contentIndex: 0, text: 'plan', status: 'thought', durationMs: 13 },
				{ contentIndex: 1, text: '', status: 'thought', redacted: true }
			],
			tools: [{ contentIndex: 2, id: 'call-1', name: 'mcp_search', status: 'pending' }]
		});
	});

	it('keeps running tools running across stale pending display echoes', () => {
		const merged = mergeChatMessageDisplay(
			{
				role: 'assistant',
				text: '',
				thoughts: [],
				tools: [{ contentIndex: 1, id: 'call-1', name: 'mcp_search', status: 'pending' }]
			},
			{
				tools: [
					{
						contentIndex: 1,
						id: 'call-1',
						name: 'mcp_search',
						status: 'running',
						startedAt: 1000
					}
				]
			}
		);

		expect(merged.tools).toEqual([
			{
				contentIndex: 1,
				id: 'call-1',
				name: 'mcp_search',
				status: 'running',
				startedAt: 1000
			}
		]);
	});

	it('preserves terminal tool statuses and stored-only live tool rows', () => {
		const merged = mergeChatMessageDisplay(
			{
				role: 'assistant',
				text: 'Done.',
				thoughts: [],
				tools: [{ contentIndex: 0, id: 'call-1', name: 'mcp_search', status: 'pending' }]
			},
			{
				tools: [
					{
						contentIndex: 0,
						id: 'call-1',
						name: 'mcp_search',
						status: 'failed',
						startedAt: 1000,
						durationMs: 500
					},
					{
						contentIndex: 1,
						id: 'call-2',
						name: 'mcp_fetch',
						status: 'completed',
						startedAt: 1500,
						durationMs: 700
					}
				]
			}
		);

		expect(merged.tools).toEqual([
			{
				contentIndex: 0,
				id: 'call-1',
				name: 'mcp_search',
				status: 'failed',
				startedAt: 1000,
				durationMs: 500
			},
			{
				contentIndex: 1,
				id: 'call-2',
				name: 'mcp_fetch',
				status: 'completed',
				startedAt: 1500,
				durationMs: 700
			}
		]);
	});

	it('applies tool event sequences to canonical display state', () => {
		const initial = { role: 'assistant', text: '', thoughts: [], tools: [] };
		const running = applyToolEvent(
			initial,
			{ type: 'tool_execution_start', toolName: 'mcp_search', toolCallId: 'call-1' },
			1000
		);
		const updated = applyToolEvent(
			running,
			{ type: 'tool_execution_update', toolName: 'mcp_search', toolCallId: 'call-1' },
			1250
		);
		const completed = applyToolEvent(
			updated,
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

	it('uses the tool name as the id when an event has no call id', () => {
		const display = applyToolEvent(
			{ role: 'assistant', text: '', thoughts: [], tools: [] },
			{ type: 'tool_execution_end', toolName: 'mcp_search', isError: true },
			1000
		);

		expect(display.tools).toEqual([
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
