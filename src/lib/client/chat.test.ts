import { describe, expect, it } from 'vitest';

import {
	clampTemperature,
	chatThinkingSelectionFromServer,
	formatDuration,
	mergeToolIntoAssistant,
	modelOptionsForProvider,
	normalizeServerThoughts,
	normalizeServerTools,
	thoughtLabel,
	thinkingLevelForRequest,
	toolStatusLabel,
	uiMessageFromServer,
	uiMessagesFromServerSnapshot,
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

	it('keeps running tools running across pending server echoes', () => {
		const tools = normalizeServerTools(
			[{ contentIndex: 0, id: 'tool-1', name: 'mcp_search', status: 'pending' }],
			[{ contentIndex: 0, id: 'tool-1', name: 'mcp_search', status: 'running', startedAt: 100 }],
			500
		);

		expect(tools).toEqual([
			{
				contentIndex: 0,
				id: 'tool-1',
				name: 'mcp_search',
				status: 'running',
				startedAt: 100
			}
		]);
	});

	it('builds UI messages from display payloads', () => {
		const message = uiMessageFromServer(
			{
				role: 'assistant',
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
			{ id: 'message-1', role: 'assistant', text: '', thoughts: [], tools: [] }
		);

		expect(message.id).toBe('message-1');
	});

	it('merges streaming tool events into an assistant message', () => {
		const message: UiMessage = { role: 'assistant', text: '', thoughts: [], tools: [] };
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

	it('keeps completed client tools completed across stale snapshots', () => {
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
					role: 'assistant',
					text: '',
					thoughts: [],
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

	it('keeps running client tools running across stale snapshots', () => {
		const messages = uiMessagesFromServerSnapshot(
			[
				{
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
					role: 'assistant',
					text: '',
					thoughts: [],
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
			],
			3000
		);

		expect(messages[0].tools).toEqual([
			{
				contentIndex: 0,
				id: 'call-1',
				name: 'mcp_search',
				status: 'running',
				startedAt: 1000
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
					role: 'assistant',
					text: '',
					thoughts: [],
					tools: []
				},
				{
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

	it('formats durations, thought labels, and tool labels', () => {
		expect(formatDuration(undefined)).toBe('');
		expect(formatDuration(900)).toBe('<1s');
		expect(formatDuration(65_000)).toBe('1m 05s');
		expect(thoughtLabel({ contentIndex: 0, text: '', status: 'thinking', redacted: false, expanded: true, startedAt: 0 }, 2000)).toBe('Thinking... 2s');
		expect(toolStatusLabel({ contentIndex: 0, id: 'x', name: 'mcp_file_search', status: 'running', startedAt: 0 }, 2000)).toBe('Using file search 2s');
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
