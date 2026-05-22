import { describe, expect, it, vi } from 'vitest';

import {
	buildChatMessageDisplay,
	hydrateChatMessageDisplay,
	normalizeAgentEvent,
	normalizeAgentMessageForStorage,
	type ThoughtTimingsByContentIndex
} from './display';

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

	it('preserves stored in-progress display state while hydrating', () => {
		const display = hydrateChatMessageDisplay(
			{
				role: 'assistant',
				content: [
					{ type: 'thinking', thinking: 'Still working.' },
					{ type: 'toolCall', id: 'call-1', name: 'search', arguments: {} },
					{ type: 'text', text: 'Partial answer.' }
				]
			},
			{
				thoughts: [{ contentIndex: 0, status: 'thinking', durationMs: 1500 }],
				tools: [{ contentIndex: 1, id: 'call-1', name: 'search', status: 'running' }]
			}
		);

		expect(display.thoughts[0]).toMatchObject({
			contentIndex: 0,
			status: 'thinking',
			durationMs: 1500
		});
		expect(display.tools[0]).toMatchObject({
			contentIndex: 1,
			id: 'call-1',
			status: 'running'
		});
	});

	it('preserves stored tool status and timing metadata while hydrating snapshots', () => {
		const display = hydrateChatMessageDisplay(
			{
				role: 'assistant',
				content: [
					{ type: 'toolCall', id: 'call-1', name: 'search', arguments: {} },
					{ type: 'text', text: 'Done.' }
				]
			},
			{
				tools: [
					{
						contentIndex: 0,
						id: 'call-1',
						name: 'search',
						status: 'completed',
						startedAt: 1000,
						durationMs: 1500
					},
					{
						contentIndex: 1,
						id: 'call-2',
						name: 'lookup',
						status: 'failed',
						startedAt: 3000,
						durationMs: 250
					}
				]
			}
		);

		expect(display.tools).toEqual([
			{
				contentIndex: 0,
				id: 'call-1',
				name: 'search',
				status: 'completed',
				startedAt: 1000,
				durationMs: 1500
			},
			{
				contentIndex: 1,
				id: 'call-2',
				name: 'lookup',
				status: 'failed',
				startedAt: 3000,
				durationMs: 250
			}
		]);
	});

	it('defaults missing or invalid persisted tool statuses to completed while hydrating', () => {
		const display = hydrateChatMessageDisplay(
			{
				role: 'assistant',
				content: [
					{ type: 'toolCall', id: 'call-1', name: 'search', arguments: {} },
					{ type: 'toolCall', id: 'call-2', name: 'lookup', arguments: {} },
					{ type: 'text', text: 'Done.' }
				]
			},
			{
				tools: [
					{
						contentIndex: 0,
						id: 'call-1',
						name: 'search',
						startedAt: 1000,
						durationMs: 1500
					},
					{
						contentIndex: 1,
						id: 'call-2',
						name: 'lookup',
						status: 'unknown',
						startedAt: 3000,
						durationMs: 250
					}
				]
			}
		);

		expect(display.tools).toEqual([
			{
				contentIndex: 0,
				id: 'call-1',
				name: 'search',
				status: 'completed',
				startedAt: 1000,
				durationMs: 1500
			},
			{
				contentIndex: 1,
				id: 'call-2',
				name: 'lookup',
				status: 'completed',
				startedAt: 3000,
				durationMs: 250
			}
		]);
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

describe('chat turn thinking settings', () => {
	it('persists explicit thinking for a new chat', async () => {
		vi.resetModules();
		const runtimeInputs: Array<{ thinkingLevel?: string | null }> = [];
		const createdSessions: Array<{ thinkingLevel: string | null }> = [];
		const createChatSession = vi.fn(
			async (input: { title: string; thinkingLevel: string | null }) => {
				createdSessions.push(input);
				return {
					id: 'session-1',
					...input
				};
			}
		);
		const createServerAgentSession = vi.fn(async (input: { thinkingLevel?: string | null }) => {
			runtimeInputs.push(input);
			return {
			provider: { id: 'provider-1', providerId: 'openai' },
			model: { id: 'model-1' },
			session: { dispose: vi.fn() }
			};
		});

		vi.doMock('$lib/server/repositories/chat', () => ({
			getChatSession: vi.fn(),
			listChatMessages: vi.fn(async () => []),
			createChatSession,
			updateChatSession: vi.fn()
		}));
		vi.doMock('$lib/server/agent/runtime', () => ({ createServerAgentSession }));

		const { prepareChatTurn } = await import('./service');
		await prepareChatTurn({ message: 'hello', thinkingLevel: 'high' });

		expect(runtimeInputs[0]?.thinkingLevel).toBe('high');
		expect(createdSessions[0]?.thinkingLevel).toBe('high');
		vi.doUnmock('$lib/server/repositories/chat');
		vi.doUnmock('$lib/server/agent/runtime');
	});

	it('clears existing explicit thinking when a chat switches to auto', async () => {
		vi.resetModules();
		const runtimeInputs: Array<{ thinkingLevel?: string | null }> = [];
		const updateInputs: Array<{ thinkingLevel?: string | null }> = [];
		const updateChatSession = vi.fn(async (_id: string, input: { thinkingLevel?: string | null }) => {
			updateInputs.push(input);
		});
		const createServerAgentSession = vi.fn(async (input: { thinkingLevel?: string | null }) => {
			runtimeInputs.push(input);
			return {
			provider: { id: 'provider-1', providerId: 'openai' },
			model: { id: 'model-1' },
			session: { dispose: vi.fn() }
			};
		});

		vi.doMock('$lib/server/repositories/chat', () => ({
			getChatSession: vi.fn(async () => ({
				id: 'session-1',
				title: 'Existing chat',
				providerConnectionId: 'provider-1',
				providerId: 'openai',
				modelId: 'model-1',
				thinkingLevel: 'high',
				systemPrompt: '',
				temperature: null
			})),
			listChatMessages: vi.fn(async () => []),
			createChatSession: vi.fn(),
			updateChatSession
		}));
		vi.doMock('$lib/server/agent/runtime', () => ({ createServerAgentSession }));

		const { prepareChatTurn } = await import('./service');
		await prepareChatTurn({ sessionId: 'session-1', message: 'hello', thinkingLevel: null });

		expect(runtimeInputs[0]?.thinkingLevel).toBeNull();
		expect(updateInputs[0]?.thinkingLevel).toBeNull();
		vi.doUnmock('$lib/server/repositories/chat');
		vi.doUnmock('$lib/server/agent/runtime');
	});
});
