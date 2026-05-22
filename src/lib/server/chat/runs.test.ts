import { describe, expect, it } from 'vitest';

import type { ChatMessageInput } from '$lib/server/repositories/chat';
import { applyToolEvent, type ChatMessageDisplay } from '$lib/shared/chat-display';
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

	it('matches canonical tool event state while merging stored run events', () => {
		const events = [
			{ type: 'tool_execution_start', toolName: 'mcp_search', toolCallId: 'call-1' },
			{ type: 'tool_execution_update', toolName: 'mcp_search', toolCallId: 'call-1' },
			{ type: 'tool_execution_end', toolName: 'mcp_search', toolCallId: 'call-1' }
		];
		const times = [1000, 1500, 2750];
		let message: ChatMessageInput = {
			role: 'assistant',
			contentText: '',
			piMessage: { role: 'assistant', content: [] },
			display: {
				role: 'assistant',
				text: '',
				thoughts: [],
				tools: []
			} as unknown as Record<string, unknown>
		};
		let display: ChatMessageDisplay = { role: 'assistant', text: '', thoughts: [], tools: [] };

		for (const [index, event] of events.entries()) {
			message = mergeToolEventIntoStoredMessage(message, event, times[index]);
			display = applyToolEvent(display, event, times[index]);
		}

		expect(message.display).toEqual(display);
	});
});
