import { describe, expect, it } from 'vitest';

import { applyToolEventToDisplay, type ChatMessageDisplay } from '$lib/shared/chat-display';
import type { ChatMessageInput } from '$lib/server/repositories/chat';

import {
	attachChatRunEventSequenceMetadata,
	mergeToolEventIntoStoredMessage,
	settleRunMessageSnapshotTools
} from './runs';

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

	it('settles only active assistant snapshot tools as completed', () => {
		const userMessage: ChatMessageInput = {
			role: 'user',
			contentText: 'time?',
			piMessage: { role: 'user', content: [{ type: 'text', text: 'time?' }] },
			display: {
				role: 'user',
				text: 'time?',
				thoughts: [],
				tools: [
					{
						contentIndex: 0,
						id: 'user-tool',
						name: 'ignored',
						status: 'running',
						startedAt: 1000
					}
				]
			}
		};
		const assistantMessage: ChatMessageInput = {
			role: 'assistant',
			contentText: 'Done.',
			piMessage: { role: 'assistant', content: [{ type: 'text', text: 'Done.' }] },
			display: {
				role: 'assistant',
				text: 'Done.',
				thoughts: [],
				tools: [
					{
						contentIndex: 0,
						id: 'call-1',
						name: 'current_datetime',
						status: 'running',
						startedAt: 1000
					},
					{
						contentIndex: 1,
						id: 'call-2',
						name: 'mcp_search',
						status: 'failed',
						durationMs: 250
					}
				]
			}
		};
		const snapshots = new Map([
			[1, userMessage],
			[2, assistantMessage]
		]);

		const settled = settleRunMessageSnapshotTools(snapshots, 'completed', 1750);

		expect(settled.changedSequences).toEqual([2]);
		expect(settled.messageSnapshots).not.toBe(snapshots);
		expect(settled.messageSnapshots.get(1)).toBe(userMessage);
		expect(settled.messageSnapshots.get(2)?.display?.tools).toEqual([
			{
				contentIndex: 0,
				id: 'call-1',
				name: 'current_datetime',
				status: 'completed',
				startedAt: 1000,
				durationMs: 750
			},
			{
				contentIndex: 1,
				id: 'call-2',
				name: 'mcp_search',
				status: 'failed',
				durationMs: 250
			}
		]);
	});

	it('settles only active assistant snapshot tools as failed', () => {
		const snapshots = new Map<number, ChatMessageInput>([
			[
				1,
				{
					role: 'assistant',
					contentText: '',
					piMessage: { role: 'assistant', content: [] },
					display: {
						role: 'assistant',
						text: '',
						thoughts: [],
						tools: [
							{
								contentIndex: 0,
								id: 'call-1',
								name: 'mcp_search',
								status: 'pending'
							}
						]
					}
				}
			],
			[
				2,
				{
					role: 'system',
					contentText: 'metadata',
					piMessage: { role: 'system', content: [{ type: 'text', text: 'metadata' }] },
					display: {
						role: 'system',
						text: 'metadata',
						thoughts: [],
						tools: [
							{
								contentIndex: 0,
								id: 'system-tool',
								name: 'ignored',
								status: 'running',
								startedAt: 1000
							}
						]
					}
				}
			]
		]);

		const settled = settleRunMessageSnapshotTools(snapshots, 'failed', 2000);

		expect(settled.changedSequences).toEqual([1]);
		expect(settled.messageSnapshots.get(1)?.display?.tools).toEqual([
			{
				contentIndex: 0,
				id: 'call-1',
				name: 'mcp_search',
				status: 'failed'
			}
		]);
		expect(settled.messageSnapshots.get(2)).toBe(snapshots.get(2));
	});

	it('returns the original snapshot map when no assistant tools are active', () => {
		const snapshots = new Map<number, ChatMessageInput>([
			[
				1,
				{
					role: 'assistant',
					contentText: 'Done.',
					piMessage: { role: 'assistant', content: [{ type: 'text', text: 'Done.' }] },
					display: {
						role: 'assistant',
						text: 'Done.',
						thoughts: [],
						tools: [
							{
								contentIndex: 0,
								id: 'call-1',
								name: 'mcp_search',
								status: 'completed',
								durationMs: 100
							}
						]
					}
				}
			]
		]);

		const settled = settleRunMessageSnapshotTools(snapshots, 'failed', 2000);

		expect(settled.changedSequences).toEqual([]);
		expect(settled.messageSnapshots).toBe(snapshots);
	});

	it('attaches stable sequence metadata to streamed message and tool events', () => {
		expect(
			attachChatRunEventSequenceMetadata({ type: 'message_update' }, 'message_update', 12, 10)
		).toEqual({
			type: 'message_update',
			sequence: 12
		});

		expect(
			attachChatRunEventSequenceMetadata(
				{ type: 'tool_execution_start', toolName: 'current_datetime' },
				'tool_execution_start',
				13,
				12
			)
		).toEqual({
			type: 'tool_execution_start',
			toolName: 'current_datetime',
			assistantSequence: 12
		});
	});
});
