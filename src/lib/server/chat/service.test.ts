import { describe, expect, it, vi } from 'vitest';

import {
	buildChatMessageDisplay,
	hydrateChatMessageDisplay,
	normalizeAgentEvent,
	normalizeAgentMessageForStorage,
	type ThoughtTimingsByContentIndex
} from './display';
import { PREBUILT_GENERAL_AGENT_ID } from '$lib/shared/prebuilt-general-agent';

function testAgent(overrides: Record<string, unknown> = {}) {
	return {
		id: PREBUILT_GENERAL_AGENT_ID,
		name: 'General Agent Alfred',
		systemPrompt: 'You are General Agent Alfred.',
		toolNames: [],
		mcpServerIds: [],
		toolAccess: 'all',
		mcpServerAccess: 'all',
		isDefault: true,
		isPrebuilt: true,
		toolsLocked: true,
		mcpServersLocked: true,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides
	};
}

function agentRepositoryMock(agent: Record<string, unknown> = testAgent()) {
	return {
		getAgent: vi.fn(async () => agent),
		getDefaultAgent: vi.fn(async () => agent),
		normalizeAgentIdForStorage: vi.fn((id: string | null | undefined) =>
			id && id !== PREBUILT_GENERAL_AGENT_ID ? id : null
		),
		resolveAgentSelection: vi.fn(async () => agent)
	};
}

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

	it('preserves completed live tool state while normalizing final assistant messages', () => {
		const row = normalizeAgentMessageForStorage(
			{
				role: 'assistant',
				content: [
					{ type: 'thinking', thinking: 'Need current time.' },
					{ type: 'toolCall', id: 'call-1', name: 'current_datetime', arguments: {} },
					{ type: 'text', text: 'It is 7:15 PM.' }
				]
			},
			undefined,
			{
				tools: [
					{
						contentIndex: 0,
						id: 'call-1',
						name: 'current_datetime',
						status: 'completed',
						startedAt: 1000,
						durationMs: 250
					}
				]
			}
		);

		expect(row.display.tools).toEqual([
			{
				contentIndex: 1,
				id: 'call-1',
				name: 'current_datetime',
				status: 'completed',
				startedAt: 1000,
				durationMs: 250
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

	it('hydrates stored-only tool display from placeholder assistant messages', () => {
		const display = hydrateChatMessageDisplay(
			{
				role: 'assistant',
				content: []
			},
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
		);

		expect(display.tools).toEqual([
			{
				contentIndex: 0,
				id: 'call-1',
				name: 'mcp_search',
				status: 'running',
				startedAt: 1000
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

	it('passes live stored display into final upserted agent messages', async () => {
		vi.resetModules();
		const upsertChatMessages = vi.fn();

		vi.doMock('$lib/server/repositories/chat', () => ({
			createChatSession: vi.fn(),
			getChatSession: vi.fn(),
			listChatMessages: vi.fn(),
			updateChatSession: vi.fn(),
			upsertChatMessages
		}));
		vi.doMock('$lib/server/repositories/agents', () => agentRepositoryMock());
		vi.doMock('$lib/server/agent/runtime', () => ({
			createServerAgentSession: vi.fn()
		}));

		const { upsertAgentMessages } = await import('./service');
		await upsertAgentMessages(
			'session-1',
			[
				{ role: 'user', content: [{ type: 'text', text: 'time?' }] },
				{
					role: 'assistant',
					content: [{ type: 'toolCall', id: 'call-1', name: 'current_datetime', arguments: {} }]
				}
			],
			0,
			undefined,
			new Map([
				[
					2,
					{
						display: {
							tools: [
								{
									contentIndex: 0,
									id: 'call-1',
									name: 'current_datetime',
									status: 'completed',
									startedAt: 1000,
									durationMs: 100
								}
							]
						}
					}
				]
			])
		);

		expect(upsertChatMessages).toHaveBeenCalledWith(
			'session-1',
			1,
			expect.arrayContaining([
				expect.objectContaining({
					role: 'assistant',
					display: expect.objectContaining({
						tools: [
							{
								contentIndex: 0,
								id: 'call-1',
								name: 'current_datetime',
								status: 'completed',
								startedAt: 1000,
								durationMs: 100
							}
						]
					})
				})
			])
		);
		vi.doUnmock('$lib/server/repositories/chat');
		vi.doUnmock('$lib/server/repositories/agents');
		vi.doUnmock('$lib/server/agent/runtime');
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
		vi.doMock('$lib/server/repositories/agents', () => agentRepositoryMock());
		vi.doMock('$lib/server/repositories/user-settings', () => ({
			getEffectiveUserSettings: vi.fn(async () => ({
				providers: [],
				defaultProviderId: 'provider-1',
				defaultModel: 'model-1',
				defaultThinkingLevel: null
			}))
		}));
		vi.doMock('$lib/server/agent/runtime', () => ({ createServerAgentSession }));

		const { prepareChatTurn } = await import('./service');
		await prepareChatTurn({ userId: 'user-1', message: 'hello', thinkingLevel: 'high' });

		expect(runtimeInputs[0]?.thinkingLevel).toBe('high');
		expect(createdSessions[0]?.thinkingLevel).toBe('high');
		vi.doUnmock('$lib/server/repositories/chat');
		vi.doUnmock('$lib/server/repositories/agents');
		vi.doUnmock('$lib/server/repositories/user-settings');
		vi.doUnmock('$lib/server/agent/runtime');
	});

	it('clears existing explicit thinking when a chat switches to auto', async () => {
		vi.resetModules();
		const runtimeInputs: Array<{ thinkingLevel?: string | null }> = [];
		const updateInputs: Array<{ thinkingLevel?: string | null }> = [];
		const updateChatSession = vi.fn(
			async (_userId: string, _id: string, input: { thinkingLevel?: string | null }) => {
			updateInputs.push(input);
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
			getChatSession: vi.fn(async () => ({
				id: 'session-1',
				title: 'Existing chat',
				providerConnectionId: 'provider-1',
				providerId: 'openai',
				modelId: 'model-1',
				thinkingLevel: 'high',
				agentId: null,
				temperature: null
			})),
			listChatMessages: vi.fn(async () => []),
			createChatSession: vi.fn(),
			updateChatSession
		}));
		vi.doMock('$lib/server/repositories/agents', () => agentRepositoryMock());
		vi.doMock('$lib/server/agent/runtime', () => ({ createServerAgentSession }));

		const { prepareChatTurn } = await import('./service');
		await prepareChatTurn({
			userId: 'user-1',
			sessionId: 'session-1',
			message: 'hello',
			thinkingLevel: null
		});

		expect(runtimeInputs[0]?.thinkingLevel).toBeNull();
		expect(updateInputs[0]?.thinkingLevel).toBeNull();
		vi.doUnmock('$lib/server/repositories/chat');
		vi.doUnmock('$lib/server/repositories/agents');
		vi.doUnmock('$lib/server/agent/runtime');
	});
});

describe('chat turn agents', () => {
	it('uses the Prebuilt General Agent for new chats without an explicit agent', async () => {
		vi.resetModules();
		const runtimeInputs: Array<{ agent: { id?: string; systemPrompt?: string; isPrebuilt?: boolean } }> =
			[];
		const createdSessions: Array<{ agentId: string | null }> = [];
		const createChatSession = vi.fn(async (input: { agentId: string | null }) => {
			createdSessions.push(input);
			return {
				id: 'session-1',
				...input
			};
		});
		const createServerAgentSession = vi.fn(
			async (input: { agent: { id?: string; systemPrompt?: string; isPrebuilt?: boolean } }) => {
				runtimeInputs.push(input);
				return {
					provider: { id: 'provider-1', providerId: 'openai' },
					model: { id: 'model-1' },
					session: { dispose: vi.fn() }
				};
			}
		);

		vi.doMock('$lib/server/repositories/chat', () => ({
			getChatSession: vi.fn(),
			listChatMessages: vi.fn(async () => []),
			createChatSession,
			updateChatSession: vi.fn()
		}));
		vi.doMock('$lib/server/repositories/agents', () => agentRepositoryMock());
		vi.doMock('$lib/server/repositories/user-settings', () => ({
			getEffectiveUserSettings: vi.fn(async () => ({
				providers: [],
				defaultProviderId: 'provider-1',
				defaultModel: 'model-1',
				defaultThinkingLevel: null
			}))
		}));
		vi.doMock('$lib/server/agent/runtime', () => ({ createServerAgentSession }));

		const { prepareChatTurn } = await import('./service');
		await prepareChatTurn({ userId: 'user-1', message: 'hello' });

		expect(runtimeInputs[0]?.agent).toMatchObject({
			systemPrompt: 'You are General Agent Alfred.',
			isPrebuilt: true
		});
		expect(createdSessions[0]?.agentId).toBeNull();
		vi.doUnmock('$lib/server/repositories/chat');
		vi.doUnmock('$lib/server/repositories/agents');
		vi.doUnmock('$lib/server/repositories/user-settings');
		vi.doUnmock('$lib/server/agent/runtime');
	});

	it('passes selected agent to runtime without adding synthetic history', async () => {
		vi.resetModules();
		const runtimeInputs: Array<{
			agent: { systemPrompt: string };
			history?: unknown[];
		}> = [];
		const updateInputs: Array<{ agentId?: string | null }> = [];
		const agent = {
			id: '00000000-0000-4000-8000-000000000010',
			name: 'Researcher',
			systemPrompt: 'You are a careful researcher.',
			toolNames: ['current_datetime'],
			mcpServerIds: [],
			isDefault: false,
			createdAt: new Date(),
			updatedAt: new Date()
		};
		const updateChatSession = vi.fn(
			async (_userId: string, _id: string, input: { agentId?: string | null }) => {
				updateInputs.push(input);
			}
		);
		const createServerAgentSession = vi.fn(
			async (input: { agent: { systemPrompt: string }; history?: unknown[] }) => {
				runtimeInputs.push(input);
				return {
					provider: { id: 'provider-1', providerId: 'openai' },
					model: { id: 'model-1' },
					session: { dispose: vi.fn() }
				};
			}
		);

		vi.doMock('$lib/server/repositories/chat', () => ({
			getChatSession: vi.fn(async () => ({
				id: 'session-1',
				title: 'Existing chat',
				agentId: null,
				providerConnectionId: 'provider-1',
				providerId: 'openai',
				modelId: 'model-1',
				thinkingLevel: null,
				temperature: null
			})),
			listChatMessages: vi.fn(async () => [
				{
					piMessage: { role: 'user', content: [{ type: 'text', text: 'Earlier' }] }
				}
			]),
			createChatSession: vi.fn(),
			updateChatSession
		}));
		vi.doMock('$lib/server/repositories/agents', () => agentRepositoryMock(agent));
		vi.doMock('$lib/server/agent/runtime', () => ({ createServerAgentSession }));

		const { prepareChatTurn } = await import('./service');
		const turn = await prepareChatTurn({
			userId: 'user-1',
			sessionId: 'session-1',
			message: 'hello',
			agentId: agent.id
		});

		expect(runtimeInputs[0]).toMatchObject({
			agent: { systemPrompt: 'You are a careful researcher.' }
		});
		expect(runtimeInputs[0]?.history).toHaveLength(1);
		expect(turn.historyCount).toBe(1);
		expect(updateInputs[0]).toMatchObject({
			agentId: agent.id
		});
		vi.doUnmock('$lib/server/repositories/chat');
		vi.doUnmock('$lib/server/repositories/agents');
		vi.doUnmock('$lib/server/agent/runtime');
	});
});
