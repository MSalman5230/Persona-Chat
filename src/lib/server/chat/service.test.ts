import { describe, expect, it } from 'vitest';

import {
	buildChatMessageDisplay,
	hydrateChatMessageDisplay,
	normalizeAgentEvent,
	normalizeAgentMessageForStorage,
	type ThoughtTimingsByContentIndex
} from './service';

describe('chat service display helpers', () => {
	it('keeps text-only assistant messages unchanged', () => {
		const display = buildChatMessageDisplay({
			role: 'assistant',
			content: [{ type: 'text', text: 'Hello there.' }]
		});

		expect(display).toEqual({
			role: 'assistant',
			text: 'Hello there.',
			thoughts: [],
			tools: []
		});
	});

	it('extracts thinking blocks into display thoughts', () => {
		const display = buildChatMessageDisplay({
			role: 'assistant',
			content: [
				{ type: 'thinking', thinking: 'Checking the constraints.' },
				{ type: 'text', text: 'Done.' }
			]
		});

		expect(display.text).toBe('Done.');
		expect(display.thoughts).toEqual([
			{
				contentIndex: 0,
				text: 'Checking the constraints.',
				status: 'thought'
			}
		]);
		expect(display.tools).toEqual([]);
	});

	it('keeps thinking and tool calls out of contentText', () => {
		const row = normalizeAgentMessageForStorage({
			role: 'assistant',
			content: [
				{ type: 'thinking', thinking: 'Private trace.' },
				{ type: 'toolCall', id: 'call-1', name: 'search', arguments: {} },
				{ type: 'text', text: 'Visible answer.' }
			]
		});

		expect(row.contentText).toBe('Visible answer.');
		expect(row.contentText).not.toContain('thinking');
		expect(row.contentText).not.toContain('toolCall');
		expect(row.display.tools).toEqual([
			{
				contentIndex: 1,
				id: 'call-1',
				name: 'search',
				status: 'pending'
			}
		]);
	});

	it('attaches stored timing metadata to the matching thought', () => {
		const timings: ThoughtTimingsByContentIndex = new Map([
			[0, { startedAt: 1_000, endedAt: 9_250 }]
		]);

		const display = buildChatMessageDisplay(
			{
				role: 'assistant',
				content: [
					{ type: 'thinking', thinking: 'Timed thought.' },
					{ type: 'text', text: 'Answer.' }
				]
			},
			timings
		);

		expect(display.thoughts[0]).toMatchObject({
			contentIndex: 0,
			status: 'thought',
			durationMs: 8_250
		});
	});

	it('hydrates old stored messages with thinking blocks but no duration', () => {
		const display = hydrateChatMessageDisplay(
			{
				role: 'assistant',
				content: [
					{ type: 'thinking', thinking: 'Old thought.' },
					{ type: 'text', text: 'Old answer.' }
				]
			},
			{ role: 'assistant', text: 'Old answer.' }
		);

		expect(display).toEqual({
			role: 'assistant',
			text: 'Old answer.',
			thoughts: [
				{
					contentIndex: 0,
					text: 'Old thought.',
					status: 'thought'
				}
			],
			tools: []
		});
	});

	it('does not expose redacted thinking signatures in normalized events', () => {
		const message = {
			role: 'assistant',
			content: [
				{
					type: 'thinking',
					thinking: 'Should not be shown.',
					thinkingSignature: 'opaque-secret',
					redacted: true
				},
				{ type: 'text', text: 'Public answer.' }
			]
		};

		const event = normalizeAgentEvent({
			type: 'message_update',
			message,
			assistantMessageEvent: {
				type: 'thinking_delta',
				contentIndex: 0,
				delta: 'opaque-secret',
				partial: message
			}
		});

		expect(event).toMatchObject({
			type: 'message_update',
			message: {
				role: 'assistant',
				text: 'Public answer.',
				display: {
					thoughts: [
						{
							contentIndex: 0,
							text: '',
							status: 'thought',
							redacted: true
						}
					],
					tools: []
				}
			},
			assistantMessageEvent: {
				type: 'thinking_delta',
				contentIndex: 0
			}
		});
		expect(JSON.stringify(event)).not.toContain('opaque-secret');
		expect(JSON.stringify(event)).not.toContain('Should not be shown.');
	});
});
