import { describe, expect, it } from 'vitest';

import {
	clampTemperature,
	chatThinkingSelectionFromServer,
	createLocalUiMessage,
	formatDuration,
	groupMessagesIntoConversationTurns,
	mergeTurnThoughtsForDisplay,
	mergeToolEventIntoMessages,
	mergeToolIntoAssistant,
	modelOptionsForProvider,
	normalizeServerThoughts,
	thoughtLabel,
	thinkingLevelForRequest,
	toolActivityLabel,
	toolStatusLabel,
	uiMessageFromServer,
	uiMessagesFromServerSnapshot,
	upsertUiMessageFromServer,
	type UiMessage
} from './chat';

describe('chat client helpers', () => {
	it('clamps temperature to supported one-decimal bounds', () => {
		expect(clampTemperature(-1)).toBe(0);
		expect(clampTemperature(2.9)).toBe(2);
		expect(clampTemperature(0.74)).toBe(0.7);
		expect(clampTemperature(Number.NaN)).toBe(0.7);
	});

	it('maps chat thinking selections to server request values', () => {
		expect(chatThinkingSelectionFromServer(null)).toBe('auto');
		expect(chatThinkingSelectionFromServer(undefined)).toBe('auto');
		expect(chatThinkingSelectionFromServer('medium')).toBe('medium');
		expect(chatThinkingSelectionFromServer('unsupported')).toBe('auto');
		expect(thinkingLevelForRequest('auto')).toBeNull();
		expect(thinkingLevelForRequest('high')).toBe('high');
	});

	it('normalizes server thoughts while preserving expanded state', () => {
		const thoughts = normalizeServerThoughts(
			[
				{ contentIndex: 0, text: 'working', status: 'thinking', durationMs: 500 },
				{ contentIndex: 1, text: 'hidden', status: 'thought', redacted: true }
			],
			[{ contentIndex: 0, text: 'old', status: 'thought', redacted: false, expanded: false }],
			1000
		);

		expect(thoughts).toEqual([
			{
				contentIndex: 0,
				text: 'working',
				status: 'thinking',
				durationMs: 500,
				redacted: false,
				expanded: true,
				startedAt: 500
			},
			{
				contentIndex: 1,
				text: '',
				status: 'thought',
				redacted: true,
				expanded: false
			}
		]);
	});

	it('builds UI messages from display payloads', () => {
		const message = uiMessageFromServer(
			{
				role: 'assistant',
				sequence: 4,
				display: {
					text: 'hello',
					thoughts: [{ contentIndex: 0, text: 'plan', status: 'thought' }],
					tools: [{ contentIndex: 0, id: 'tool-1', name: 'mcp_search', status: 'completed' }]
				}
			},
			undefined,
			1000
		);

		expect(message.role).toBe('assistant');
		expect(message.id).toBeUndefined();
		expect(message.sequence).toBe(4);
		expect(message.clientKey).toBe('seq:4');
		expect(message.text).toBe('hello');
		expect(message.thoughts).toHaveLength(1);
		expect(message.tools).toHaveLength(1);
	});

	it('preserves message ids across streaming payloads without ids', () => {
		const message = uiMessageFromServer(
			{
				role: 'assistant',
				display: { text: 'updated', thoughts: [], tools: [] }
			},
			{ id: 'message-1', clientKey: 'id:message-1', role: 'assistant', text: '', thoughts: [], tools: [] }
		);

		expect(message.id).toBe('message-1');
		expect(message.clientKey).toBe('id:message-1');
	});

	it('merges streaming tool events into an assistant message', () => {
		const message: UiMessage = { clientKey: 'assistant-1', role: 'assistant', text: '', thoughts: [], tools: [] };
		const running = mergeToolIntoAssistant(
			message,
			{ type: 'tool_execution_start', toolName: 'mcp_web_search', toolCallId: 'call-1' },
			1000
		);
		const completed = mergeToolIntoAssistant(
			running,
			{ type: 'tool_execution_end', toolName: 'mcp_web_search', toolCallId: 'call-1' },
			2500
		);

		expect(completed.tools).toEqual([
			{
				contentIndex: 0,
				id: 'call-1',
				name: 'mcp_web_search',
				status: 'completed',
				startedAt: 1000,
				durationMs: 1500
			}
		]);
	});

	it('threads previous message state through snapshot normalization', () => {
		const messages = uiMessagesFromServerSnapshot(
			[
				{
					id: 'message-1',
					role: 'assistant',
					display: {
						text: '',
						thoughts: [],
						tools: [{ contentIndex: 0, id: 'call-1', name: 'mcp_search', status: 'pending' }]
					}
				}
			],
			[
				{
					id: 'message-1',
					clientKey: 'id:message-1',
					role: 'assistant',
					text: '',
					thoughts: [
						{
							contentIndex: 0,
							text: 'Still thinking',
							status: 'thinking',
							redacted: false,
							expanded: true,
							startedAt: 1000
						}
					],
					tools: [
						{
							contentIndex: 0,
							id: 'call-1',
							name: 'mcp_search',
							status: 'completed',
							startedAt: 1000,
							durationMs: 1500
						}
					]
				}
			],
			3000
		);

		expect(messages[0].thoughts).toEqual([
			{
				contentIndex: 0,
				text: 'Still thinking',
				status: 'thinking',
				redacted: false,
				expanded: true,
				startedAt: 1000
			}
		]);
		expect(messages[0].tools).toEqual([
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

	it('matches snapshot messages by id before falling back to index', () => {
		const messages = uiMessagesFromServerSnapshot(
			[
				{
					id: 'message-b',
					role: 'assistant',
					display: {
						text: '',
						thoughts: [],
						tools: [{ contentIndex: 0, id: 'call-b', name: 'mcp_search', status: 'pending' }]
					}
				},
				{
					role: 'assistant',
					display: {
						text: '',
						thoughts: [],
						tools: [{ contentIndex: 0, id: 'call-index', name: 'mcp_lookup', status: 'pending' }]
					}
				}
			],
			[
				{
					id: 'message-a',
					clientKey: 'id:message-a',
					role: 'assistant',
					text: '',
					thoughts: [],
					tools: []
				},
				{
					clientKey: 'local:assistant:index',
					role: 'assistant',
					text: '',
					thoughts: [],
					tools: [
						{
							contentIndex: 0,
							id: 'call-index',
							name: 'mcp_lookup',
							status: 'running',
							startedAt: 2000
						}
					]
				},
				{
					id: 'message-b',
					clientKey: 'id:message-b',
					role: 'assistant',
					text: '',
					thoughts: [],
					tools: [
						{
							contentIndex: 0,
							id: 'call-b',
							name: 'mcp_search',
							status: 'completed',
							startedAt: 1000,
							durationMs: 1500
						}
					]
				}
			],
			3000
		);

		expect(messages[0].tools[0]).toMatchObject({
			id: 'call-b',
			status: 'completed',
			startedAt: 1000,
			durationMs: 1500
		});
		expect(messages[1].id).toBeUndefined();
		expect(messages[1].tools[0]).toMatchObject({
			id: 'call-index',
			status: 'running',
			startedAt: 2000
		});
	});

	it('preserves optimistic client keys when snapshots add server identity', () => {
		const optimistic = createLocalUiMessage('assistant');
		const messages = uiMessagesFromServerSnapshot(
			[
				{
					id: 'message-2',
					sequence: 2,
					role: 'assistant',
					display: { text: 'hello', thoughts: [], tools: [] }
				}
			],
			[optimistic],
			3000
		);

		expect(messages[0]).toMatchObject({
			id: 'message-2',
			sequence: 2,
			clientKey: optimistic.clientKey,
			text: 'hello'
		});
	});

	it('updates assistant messages by sequence instead of the last row', () => {
		const messages: UiMessage[] = [
			{ clientKey: 'user-1', sequence: 1, role: 'user', text: 'time?', thoughts: [], tools: [] },
			{ clientKey: 'assistant-2', sequence: 2, role: 'assistant', text: '', thoughts: [], tools: [] },
			{
				clientKey: 'tool-3',
				sequence: 3,
				role: 'tool',
				text: '{"local":"7:15 PM"}',
				thoughts: [],
				tools: [],
				toolName: 'current_datetime'
			}
		];

		const updated = upsertUiMessageFromServer(messages, {
			role: 'assistant',
			sequence: 2,
			display: { text: 'I checked the clock.', thoughts: [], tools: [] }
		});

		expect(updated[1]).toMatchObject({
			clientKey: 'assistant-2',
			sequence: 2,
			text: 'I checked the clock.'
		});
		expect(updated[2].text).toBe('{"local":"7:15 PM"}');
	});

	it('merges tool events into the assistant sequence that requested them', () => {
		const messages: UiMessage[] = [
			{ clientKey: 'assistant-2', sequence: 2, role: 'assistant', text: '', thoughts: [], tools: [] },
			{ clientKey: 'tool-3', sequence: 3, role: 'tool', text: 'tool output', thoughts: [], tools: [] },
			{ clientKey: 'assistant-4', sequence: 4, role: 'assistant', text: '', thoughts: [], tools: [] }
		];

		const updated = mergeToolEventIntoMessages(
			messages,
			{
				type: 'tool_execution_start',
				toolName: 'current_datetime',
				toolCallId: 'call-1',
				assistantSequence: 2
			},
			1000
		);

		expect(updated[0].tools).toEqual([
			{
				contentIndex: 0,
				id: 'call-1',
				name: 'current_datetime',
				status: 'running',
				startedAt: 1000
			}
		]);
		expect(updated[2].tools).toEqual([]);
	});

	it('groups one user message with multiple assistant turns and hides tool output rows', () => {
		const turns = groupMessagesIntoConversationTurns([
			{ clientKey: 'user-1', sequence: 1, role: 'user', text: 'time?', thoughts: [], tools: [] },
			{
				clientKey: 'assistant-2',
				sequence: 2,
				role: 'assistant',
				text: '',
				thoughts: [
					{
						contentIndex: 0,
						text: 'Need current time.',
						status: 'thought',
						redacted: false,
						expanded: false
					}
				],
				tools: [
					{
						contentIndex: 1,
						id: 'call-1',
						name: 'current_datetime',
						status: 'completed',
						durationMs: 500
					}
				]
			},
			{
				clientKey: 'tool-3',
				sequence: 3,
				role: 'tool',
				text: '{"local":"7:15 PM"}',
				thoughts: [],
				tools: [],
				toolName: 'current_datetime'
			},
			{
				clientKey: 'assistant-4',
				sequence: 4,
				role: 'assistant',
				text: 'It is 7:15 PM.',
				thoughts: [
					{
						contentIndex: 0,
						text: 'Summarize the result.',
						status: 'thought',
						redacted: false,
						expanded: false
					}
				],
				tools: []
			}
		]);

		expect(turns).toHaveLength(1);
		expect(turns[0].user?.text).toBe('time?');
		expect(turns[0].assistantText).toBe('It is 7:15 PM.');
		expect(turns[0].thoughts.map((thought) => thought.text)).toEqual([
			'Need current time.',
			'Summarize the result.'
		]);
		expect(turns[0].tools.map(toolActivityLabel)).toEqual(['tool:current_datetime']);
		expect(JSON.stringify(turns[0])).not.toContain('7:15 PM"}');
	});

	it('merges turn thoughts into one display thought', () => {
		const turns = groupMessagesIntoConversationTurns([
			{ clientKey: 'user-1', sequence: 1, role: 'user', text: 'time?', thoughts: [], tools: [] },
			{
				clientKey: 'assistant-2',
				sequence: 2,
				role: 'assistant',
				text: '',
				thoughts: [
					{
						contentIndex: 0,
						text: 'Need current time.',
						status: 'thought',
						durationMs: 500,
						redacted: false,
						expanded: false
					}
				],
				tools: []
			},
			{
				clientKey: 'assistant-4',
				sequence: 4,
				role: 'assistant',
				text: 'It is 7:15 PM.',
				thoughts: [
					{
						contentIndex: 0,
						text: 'Summarize the result.',
						status: 'thought',
						durationMs: 1500,
						redacted: false,
						expanded: true
					}
				],
				tools: []
			}
		]);

		const merged = mergeTurnThoughtsForDisplay(turns[0].thoughts, turns[0].key, 5000);

		expect(merged).toHaveLength(1);
		expect(merged[0]).toMatchObject({
			contentIndex: 0,
			text: 'Need current time.\n\nSummarize the result.',
			status: 'thought',
			durationMs: 2000,
			redacted: false,
			expanded: true,
			thoughtKey: `${turns[0].key}:thoughts`,
			sources: [
				{ sourceKey: 'assistant-2', contentIndex: 0 },
				{ sourceKey: 'assistant-4', contentIndex: 0 }
			]
		});
		expect(thoughtLabel(merged[0], 5000)).toBe('Thought for 2s');
	});

	it('keeps merged display thoughts active when any source is thinking', () => {
		const merged = mergeTurnThoughtsForDisplay(
			[
				{
					sourceKey: 'assistant-2',
					thoughtKey: 'assistant-2:thought:0',
					contentIndex: 0,
					text: 'Prepared earlier.',
					status: 'thought',
					durationMs: 1000,
					redacted: false,
					expanded: false
				},
				{
					sourceKey: 'assistant-4',
					thoughtKey: 'assistant-4:thought:0',
					contentIndex: 0,
					text: 'Still thinking',
					status: 'thinking',
					redacted: false,
					expanded: false,
					startedAt: 3000
				}
			],
			'turn:user-1',
			5000
		);

		expect(merged[0]).toMatchObject({
			text: 'Prepared earlier.\n\nStill thinking',
			status: 'thinking',
			durationMs: 3000,
			startedAt: 2000,
			expanded: true
		});
		expect(thoughtLabel(merged[0], 5000)).toBe('Thinking... 3s');
	});

	it('keeps all-redacted merged thoughts redacted', () => {
		const merged = mergeTurnThoughtsForDisplay(
			[
				{
					sourceKey: 'assistant-2',
					thoughtKey: 'assistant-2:thought:0',
					contentIndex: 0,
					text: '',
					status: 'thought',
					durationMs: 500,
					redacted: true,
					expanded: false
				},
				{
					sourceKey: 'assistant-4',
					thoughtKey: 'assistant-4:thought:0',
					contentIndex: 1,
					text: '',
					status: 'thought',
					durationMs: 500,
					redacted: true,
					expanded: false
				}
			],
			'turn:user-1',
			5000
		);

		expect(merged[0]).toMatchObject({
			text: '',
			status: 'thought',
			durationMs: 1000,
			redacted: true,
			expanded: false
		});
	});

	it('formats durations, thought labels, and tool labels', () => {
		expect(formatDuration(undefined)).toBe('');
		expect(formatDuration(900)).toBe('<1s');
		expect(formatDuration(65_000)).toBe('1m 05s');
		expect(thoughtLabel({ contentIndex: 0, text: '', status: 'thinking', redacted: false, expanded: true, startedAt: 0 }, 2000)).toBe('Thinking... 2s');
		expect(toolStatusLabel({ contentIndex: 0, id: 'x', name: 'mcp_file_search', status: 'running', startedAt: 0 }, 2000)).toBe('Using file search 2s');
		expect(toolActivityLabel({ contentIndex: 0, id: 'x', name: 'current_datetime', status: 'running' })).toBe('tool:current_datetime');
	});

	it('limits chat model options to the default and favorites', () => {
		expect(
			modelOptionsForProvider({
				id: 'provider-1',
				name: 'Provider',
				defaultModel: 'model-a',
				models: ['model-a', 'model-b', 'model-c'],
				favoriteModels: ['model-c', 'model-a']
			})
		).toEqual([
			{ id: 'model-a', name: 'model-a' },
			{ id: 'model-c', name: 'model-c' }
		]);
	});
});
