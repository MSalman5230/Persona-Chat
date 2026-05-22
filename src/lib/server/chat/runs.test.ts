import { describe, expect, it } from 'vitest';

import { applyToolEventToDisplay, type ChatMessageDisplay } from '$lib/shared/chat-display';
import type { ChatMessageInput } from '$lib/server/repositories/chat';

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

	it('matches client display merging for the same tool event payloads', () => {
		const events: Record<string, unknown>[] = [
			{ type: 'tool_execution_start', toolName: 'mcp_search', toolCallId: 'call-1' },
			{ type: 'tool_execution_update', toolName: 'mcp_search', toolCallId: 'call-1' },
			{ type: 'tool_execution_end', toolName: 'mcp_search', toolCallId: 'call-1' }
		];
		const times = [1000, 1500, 2500];
		const initialDisplay: ChatMessageDisplay = {
			role: 'assistant',
			text: '',
			thoughts: [],
			tools: []
		};
		const initialMessage: ChatMessageInput = {
			role: 'assistant',
			contentText: '',
			piMessage: { role: 'assistant', content: [] },
			display: initialDisplay
		};
		let sharedDisplay = initialDisplay;
		let storedMessage = initialMessage;

		for (const [index, event] of events.entries()) {
			sharedDisplay = applyToolEventToDisplay(sharedDisplay, event, times[index]);
			storedMessage = mergeToolEventIntoStoredMessage(storedMessage, event, times[index]);
		}

		expect(storedMessage.display?.tools).toEqual(sharedDisplay.tools);
	});

	it('returns the same stored message reference when the tool name is missing', () => {
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

		const updated = mergeToolEventIntoStoredMessage(
			message,
			{ type: 'tool_execution_start', toolCallId: 'call-1' },
			1000
		);

		expect(updated).toBe(message);
	});
});
