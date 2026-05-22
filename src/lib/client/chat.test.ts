import { describe, expect, it } from 'vitest';

import {
	clampTemperature,
	chatThinkingSelectionFromServer,
	collapseMessagesForDisplay,
	formatDuration,
	mergeToolIntoAssistant,
	modelOptionsForProvider,
	normalizeServerThoughts,
	normalizeServerTools,
	thoughtGroupForMessage,
	thoughtGroupLabel,
	thoughtLabel,
	thinkingLevelForRequest,
	toolStatusLabel,
	uiMessageFromServer,
	type UiMessage
} from './chat';
import { applyToolEvent, type ChatMessageDisplay } from '$lib/shared/chat-display';

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

	it('preserves live tool rows across empty server display echoes', () => {
		const tools = normalizeServerTools(
			[],
			[
				{
					contentIndex: 0,
					id: 'tool-1',
					name: 'mcp_search',
					status: 'running',
					startedAt: 100
				}
			],
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
		expect(message.text).toBe('hello');
		expect(message.thoughts).toHaveLength(1);
		expect(message.tools).toHaveLength(1);
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

	it('matches canonical tool event state while merging live client events', () => {
		const events = [
			{ type: 'tool_execution_start', toolName: 'mcp_web_search', toolCallId: 'call-1' },
			{ type: 'tool_execution_update', toolName: 'mcp_web_search', toolCallId: 'call-1' },
			{ type: 'tool_execution_end', toolName: 'mcp_web_search', toolCallId: 'call-1' }
		];
		const times = [1000, 1500, 2750];
		let message: UiMessage = { role: 'assistant', text: '', thoughts: [], tools: [] };
		let display: ChatMessageDisplay = { role: 'assistant', text: '', thoughts: [], tools: [] };

		for (const [index, event] of events.entries()) {
			message = mergeToolIntoAssistant(message, event, times[index]);
			display = applyToolEvent(display, event, times[index]);
		}

		expect({
			role: message.role,
			text: message.text,
			thoughts: [],
			tools: message.tools
		}).toEqual(display);
	});

	it('groups multiple thoughts into one presentation model', () => {
		const message: UiMessage = {
			role: 'assistant',
			text: '',
			tools: [],
			thoughts: [
				{
					contentIndex: 0,
					text: 'First.',
					status: 'thought',
					durationMs: 500,
					redacted: false,
					expanded: false
				},
				{
					contentIndex: 2,
					text: 'Second.',
					status: 'thinking',
					redacted: false,
					expanded: true,
					startedAt: 1000
				}
			]
		};
		const group = thoughtGroupForMessage(message);

		expect(group).toMatchObject({
			contentIndex: 0,
			status: 'thinking',
			expanded: true,
			startedAt: 1000
		});
		expect(group?.thoughts).toHaveLength(2);
		expect(group ? thoughtGroupLabel(group, 2500) : '').toBe('Thinking... 2s');
	});

	it('collapses PI internal tool turns into one visible assistant message', () => {
		const messages: UiMessage[] = [
			{ role: 'user', text: 'search', thoughts: [], tools: [], sequence: 1 },
			{
				role: 'assistant',
				text: 'I will search.',
				sequence: 2,
				sourceSequences: [2],
				thoughts: [
					{
						contentIndex: 0,
						text: 'Find the tool.',
						status: 'thought',
						durationMs: 500,
						redacted: false,
						expanded: false
					}
				],
				tools: [
					{
						contentIndex: 1,
						id: 'call-1',
						name: 'mcp_search',
						status: 'pending'
					}
				]
			},
			{
				role: 'tool',
				text: '{"huge":"payload"}',
				thoughts: [],
				tools: [],
				toolName: 'mcp_search',
				toolCallId: 'call-1',
				sequence: 3
			},
			{
				role: 'assistant',
				text: 'Here is the answer.',
				sequence: 4,
				sourceSequences: [4],
				thoughts: [
					{
						contentIndex: 0,
						text: 'Summarize results.',
						status: 'thought',
						durationMs: 600,
						redacted: false,
						expanded: false
					}
				],
				tools: []
			}
		];

		const collapsed = collapseMessagesForDisplay(messages);

		expect(collapsed).toHaveLength(2);
		expect(collapsed[1]).toMatchObject({
			role: 'assistant',
			text: 'I will search.\n\nHere is the answer.',
			sourceSequences: [2, 4],
			tools: [
					{
						id: 'call-1',
						name: 'mcp_search',
						status: 'completed',
						durationMs: 0
					}
				]
			});
		expect(collapsed[1].thoughts).toEqual([
			{
				contentIndex: 0,
				text: 'Find the tool.',
				status: 'thought',
				durationMs: 500,
				redacted: false,
				expanded: false
			},
			{
				contentIndex: 2,
				text: 'Summarize results.',
				status: 'thought',
				durationMs: 600,
				redacted: false,
				expanded: false
			}
		]);
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
