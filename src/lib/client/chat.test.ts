import { describe, expect, it } from 'vitest';

import {
	clampTemperature,
	chatThinkingSelectionFromServer,
	consumeSseChunk,
	formatDuration,
	mergeToolIntoAssistant,
	modelOptionsForProvider,
	normalizeServerThoughts,
	normalizeServerTools,
	thoughtLabel,
	thinkingLevelForRequest,
	toolStatusLabel,
	uiMessageFromServer,
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

	it('formats durations, thought labels, and tool labels', () => {
		expect(formatDuration(undefined)).toBe('');
		expect(formatDuration(900)).toBe('<1s');
		expect(formatDuration(65_000)).toBe('1m 05s');
		expect(thoughtLabel({ contentIndex: 0, text: '', status: 'thinking', redacted: false, expanded: true, startedAt: 0 }, 2000)).toBe('Thinking... 2s');
		expect(toolStatusLabel({ contentIndex: 0, id: 'x', name: 'mcp_file_search', status: 'running', startedAt: 0 }, 2000)).toBe('Using file search 2s');
	});

	it('parses complete SSE events and returns the partial buffer', () => {
		const events: Array<[string, string]> = [];
		const rest = consumeSseChunk(
			'event: session\ndata: {"id":"1"}\n\nevent: event\ndata: {"type":"message_update"}\n\npartial',
			(event, data) => events.push([event, data])
		);

		expect(rest).toBe('partial');
		expect(events).toEqual([
			['session', '{"id":"1"}'],
			['event', '{"type":"message_update"}']
		]);
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
