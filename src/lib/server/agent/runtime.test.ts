import { describe, expect, it, vi } from 'vitest';

import { BLANK_SYSTEM_PROMPT_SENTINEL } from '$lib/server/chat/settings';

import { wrapStreamFnWithSessionSettings } from './session-settings';

const usage = {
	input: 1,
	output: 2,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 3,
	cost: {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		total: 0
	}
};

describe('agent runtime session settings', () => {
	it('strips the blank prompt sentinel before calling PI providers', () => {
		const calls: Array<{ context: { systemPrompt?: string }; options: Record<string, unknown> }> = [];
		const streamFn = ((
			_model: unknown,
			context: { systemPrompt?: string },
			options: Record<string, unknown>
		) => {
			calls.push({ context, options });
			return 'stream';
		}) as unknown as Parameters<typeof wrapStreamFnWithSessionSettings>[0];

		const result = wrapStreamFnWithSessionSettings(streamFn, null)(
			{} as never,
			{ systemPrompt: BLANK_SYSTEM_PROMPT_SENTINEL, messages: [] } as never,
			{} as never
		);

		expect(result).toBe('stream');
		expect(calls[0].context.systemPrompt).toBe('');
		expect(calls[0].options).not.toHaveProperty('temperature');
	});

	it('preserves exact prompts and injects explicit temperature', () => {
		const calls: Array<{ context: { systemPrompt?: string }; options: Record<string, unknown> }> = [];
		const streamFn = ((
			_model: unknown,
			context: { systemPrompt?: string },
			options: Record<string, unknown>
		) => {
			calls.push({ context, options });
			return 'stream';
		}) as unknown as Parameters<typeof wrapStreamFnWithSessionSettings>[0];

		wrapStreamFnWithSessionSettings(streamFn, 0.4)(
			{} as never,
			{ systemPrompt: 'Use plain language.', messages: [] } as never,
			{ maxTokens: 256 } as never
		);

		expect(calls[0].context.systemPrompt).toBe('Use plain language.');
		expect(calls[0].options).toMatchObject({
			maxTokens: 256,
			temperature: 0.4
		});
	});

	it('loads stored history without synthetic messages', async () => {
		vi.resetModules();
		const appendedMessages: unknown[] = [];
		const createAgentSession = vi.fn(async () => ({
			session: {
				agent: {
					state: { systemPrompt: '' },
					streamFn: vi.fn()
				},
				dispose: vi.fn()
			},
			extensionsResult: { extensions: [], errors: [], runtime: {} }
		}));

		vi.doMock('@earendil-works/pi-coding-agent', () => ({
			createAgentSession,
			defineTool: (tool: unknown) => tool,
			SessionManager: {
				inMemory: () => ({
					appendMessage: vi.fn((message) => appendedMessages.push(message))
				})
			},
			SettingsManager: {
				inMemory: (settings: unknown) => ({ settings })
			}
		}));
		vi.doMock('$lib/server/providers/runtime', () => ({
			createProviderRuntime: vi.fn(async () => ({
				provider: { providerId: 'mock-provider' },
				model: { id: 'mock-model' },
				thinkingLevel: undefined,
				authStorage: {},
				modelRegistry: {}
			}))
		}));
		vi.doMock('$lib/server/repositories/mcp', () => ({
			getEnabledMcpServerBySlug: vi.fn(),
			getMcpSecrets: vi.fn(() => ({})),
			listEnabledMcpServers: vi.fn(),
			markMcpServerStatus: vi.fn()
		}));

		const { createServerAgentSession } = await import('./runtime');
		const runtime = await createServerAgentSession({
			history: [
				{
					role: 'user',
					content: [{ type: 'text', text: 'Earlier question.' }],
					timestamp: 1
				}
			]
		});

		expect(appendedMessages[0]).toMatchObject({
			role: 'user',
			content: [{ type: 'text', text: 'Earlier question.' }]
		});
		expect(appendedMessages).toHaveLength(1);
		expect(runtime.provider.providerId).toBe('mock-provider');
		vi.doUnmock('@earendil-works/pi-coding-agent');
		vi.doUnmock('$lib/server/providers/runtime');
		vi.doUnmock('$lib/server/repositories/mcp');
	});

	it('skips incomplete placeholders and non-PI messages when loading history', async () => {
		vi.resetModules();
		const appendedMessages: unknown[] = [];
		const createAgentSession = vi.fn(async () => ({
			session: {
				agent: {
					state: { systemPrompt: '' },
					streamFn: vi.fn()
				},
				dispose: vi.fn()
			},
			extensionsResult: { extensions: [], errors: [], runtime: {} }
		}));

		vi.doMock('@earendil-works/pi-coding-agent', () => ({
			createAgentSession,
			defineTool: (tool: unknown) => tool,
			SessionManager: {
				inMemory: () => ({
					appendMessage: vi.fn((message) => appendedMessages.push(message))
				})
			},
			SettingsManager: {
				inMemory: (settings: unknown) => ({ settings })
			}
		}));
		vi.doMock('$lib/server/providers/runtime', () => ({
			createProviderRuntime: vi.fn(async () => ({
				provider: { providerId: 'mock-provider' },
				model: { id: 'mock-model' },
				thinkingLevel: undefined,
				authStorage: {},
				modelRegistry: {}
			}))
		}));
		vi.doMock('$lib/server/repositories/mcp', () => ({
			getEnabledMcpServerBySlug: vi.fn(),
			getMcpSecrets: vi.fn(() => ({})),
			listEnabledMcpServers: vi.fn(),
			markMcpServerStatus: vi.fn()
		}));

		const { createServerAgentSession } = await import('./runtime');
		await createServerAgentSession({
			history: [
				{ role: 'assistant', content: [], timestamp: 1 },
				{ role: 'system', content: [{ type: 'text', text: 'metadata' }], timestamp: 2 },
				{
					role: 'assistant',
					content: [{ type: 'text', text: 'Earlier answer.' }],
					api: 'openai-responses',
					provider: 'openai',
					model: 'gpt-5',
					usage,
					stopReason: 'stop',
					timestamp: 3
				}
			]
		});

		expect(appendedMessages).toEqual([
			expect.objectContaining({
				role: 'assistant',
				content: [{ type: 'text', text: 'Earlier answer.' }],
				timestamp: 3
			})
		]);
		vi.doUnmock('@earendil-works/pi-coding-agent');
		vi.doUnmock('$lib/server/providers/runtime');
		vi.doUnmock('$lib/server/repositories/mcp');
	});

	it('starts chat with stable progressive MCP meta-tools only', async () => {
		vi.resetModules();
		const listEnabledMcpServers = vi.fn(async () => {
			throw new Error('MCP servers should not be connected or listed at startup');
		});
		const createAgentSession = vi.fn(async (options: Record<string, unknown>) => ({
			session: {
				agent: {
					state: { systemPrompt: '' },
					streamFn: vi.fn()
				},
				dispose: vi.fn()
			},
			extensionsResult: { extensions: [], errors: [], runtime: {} },
			options
		}));

		vi.doMock('@earendil-works/pi-coding-agent', () => ({
			createAgentSession,
			defineTool: (tool: unknown) => tool,
			SessionManager: {
				inMemory: () => ({ appendMessage: vi.fn() })
			},
			SettingsManager: {
				inMemory: (settings: unknown) => ({ settings })
			}
		}));
		vi.doMock('$lib/server/providers/runtime', () => ({
			createProviderRuntime: vi.fn(async () => ({
				provider: { providerId: 'mock-provider' },
				model: { id: 'mock-model' },
				thinkingLevel: 'medium',
				authStorage: {},
				modelRegistry: {}
			}))
		}));
		vi.doMock('$lib/server/repositories/mcp', () => ({
			getEnabledMcpServerBySlug: vi.fn(),
			getMcpSecrets: vi.fn(() => ({})),
			listEnabledMcpServers,
			markMcpServerStatus: vi.fn()
		}));

		const { createServerAgentSession } = await import('./runtime');
		const runtime = await createServerAgentSession();
		const options = createAgentSession.mock.calls[0][0] as {
			tools: string[];
			customTools: Array<{ name: string }>;
		};

		expect(runtime.allowedToolNames.filter((name) => name.startsWith('mcp_'))).toEqual([
			'mcp_list_servers',
			'mcp_list_tools',
			'mcp_call_tool'
		]);
		expect(options.customTools.map((tool) => tool.name)).toEqual(options.tools);
		expect(listEnabledMcpServers).not.toHaveBeenCalled();
		vi.doUnmock('@earendil-works/pi-coding-agent');
		vi.doUnmock('$lib/server/providers/runtime');
		vi.doUnmock('$lib/server/repositories/mcp');
	});

	it('filters app tools and MCP meta-tools through selected agent permissions', async () => {
		vi.resetModules();
		const createAgentSession = vi.fn(async (options: Record<string, unknown>) => ({
			session: {
				agent: {
					state: { systemPrompt: '' },
					streamFn: vi.fn()
				},
				dispose: vi.fn()
			},
			extensionsResult: { extensions: [], errors: [], runtime: {} },
			options
		}));

		vi.doMock('@earendil-works/pi-coding-agent', () => ({
			createAgentSession,
			defineTool: (tool: unknown) => tool,
			SessionManager: {
				inMemory: () => ({ appendMessage: vi.fn() })
			},
			SettingsManager: {
				inMemory: (settings: unknown) => ({ settings })
			}
		}));
		vi.doMock('$lib/server/providers/runtime', () => ({
			createProviderRuntime: vi.fn(async () => ({
				provider: { providerId: 'mock-provider' },
				model: { id: 'mock-model' },
				thinkingLevel: undefined,
				authStorage: {},
				modelRegistry: {}
			}))
		}));
		vi.doMock('$lib/server/repositories/mcp', () => ({
			getEnabledMcpServerBySlug: vi.fn(),
			getMcpSecrets: vi.fn(() => ({})),
			listEnabledMcpServers: vi.fn(),
			markMcpServerStatus: vi.fn()
		}));

		const { createServerAgentSession } = await import('./runtime');
		const runtime = await createServerAgentSession({
			agent: {
				systemPrompt: 'Agent prompt.',
				toolNames: ['current_datetime'],
				mcpServerIds: ['00000000-0000-4000-8000-000000000010']
			}
		});
		const options = createAgentSession.mock.calls[0][0] as {
			tools: string[];
			customTools: Array<{ name: string }>;
		};

		expect(options.customTools.map((tool) => tool.name)).toEqual([
			'current_datetime',
			'mcp_list_servers',
			'mcp_list_tools',
			'mcp_call_tool'
		]);
		expect(runtime.allowedToolNames).toEqual(options.tools);
		vi.doUnmock('@earendil-works/pi-coding-agent');
		vi.doUnmock('$lib/server/providers/runtime');
		vi.doUnmock('$lib/server/repositories/mcp');
	});

	it('can disable all app and MCP tools for an agent', async () => {
		vi.resetModules();
		const createAgentSession = vi.fn(async (options: Record<string, unknown>) => ({
			session: {
				agent: {
					state: { systemPrompt: '' },
					streamFn: vi.fn()
				},
				dispose: vi.fn()
			},
			extensionsResult: { extensions: [], errors: [], runtime: {} },
			options
		}));

		vi.doMock('@earendil-works/pi-coding-agent', () => ({
			createAgentSession,
			defineTool: (tool: unknown) => tool,
			SessionManager: {
				inMemory: () => ({ appendMessage: vi.fn() })
			},
			SettingsManager: {
				inMemory: (settings: unknown) => ({ settings })
			}
		}));
		vi.doMock('$lib/server/providers/runtime', () => ({
			createProviderRuntime: vi.fn(async () => ({
				provider: { providerId: 'mock-provider' },
				model: { id: 'mock-model' },
				thinkingLevel: undefined,
				authStorage: {},
				modelRegistry: {}
			}))
		}));
		vi.doMock('$lib/server/repositories/mcp', () => ({
			getEnabledMcpServerBySlug: vi.fn(),
			getMcpSecrets: vi.fn(() => ({})),
			listEnabledMcpServers: vi.fn(),
			markMcpServerStatus: vi.fn()
		}));

		const { createServerAgentSession } = await import('./runtime');
		const runtime = await createServerAgentSession({
			agent: {
				systemPrompt: '',
				toolNames: [],
				mcpServerIds: []
			}
		});
		const options = createAgentSession.mock.calls[0][0] as {
			tools: string[];
			customTools: Array<{ name: string }>;
		};

		expect(options.tools).toEqual([]);
		expect(options.customTools).toEqual([]);
		expect(runtime.allowedToolNames).toEqual([]);
		vi.doUnmock('@earendil-works/pi-coding-agent');
		vi.doUnmock('$lib/server/providers/runtime');
		vi.doUnmock('$lib/server/repositories/mcp');
	});

	it('omits PI thinking options when thinking level is auto', async () => {
		vi.resetModules();
		const createAgentSession = vi.fn(async (options: Record<string, unknown>) => ({
			session: {
				agent: {
					state: { systemPrompt: '' },
					streamFn: vi.fn()
				},
				dispose: vi.fn()
			},
			extensionsResult: { extensions: [], errors: [], runtime: {} },
			options
		}));

		vi.doMock('@earendil-works/pi-coding-agent', () => ({
			createAgentSession,
			defineTool: (tool: unknown) => tool,
			SessionManager: {
				inMemory: () => ({ appendMessage: vi.fn() })
			},
			SettingsManager: {
				inMemory: (settings: unknown) => ({ settings })
			}
		}));
		vi.doMock('$lib/server/providers/runtime', () => ({
			createProviderRuntime: vi.fn(async () => ({
				provider: { providerId: 'mock-provider' },
				model: { id: 'mock-model' },
				thinkingLevel: undefined,
				authStorage: {},
				modelRegistry: {}
			}))
		}));
		vi.doMock('$lib/server/repositories/mcp', () => ({
			getEnabledMcpServerBySlug: vi.fn(),
			getMcpSecrets: vi.fn(() => ({})),
			listEnabledMcpServers: vi.fn(),
			markMcpServerStatus: vi.fn()
		}));

		const { createServerAgentSession } = await import('./runtime');
		await createServerAgentSession({ thinkingLevel: null });
		const options = createAgentSession.mock.calls[0][0] as {
			thinkingLevel?: string;
			settingsManager: { settings: Record<string, unknown> };
		};

		expect(options).not.toHaveProperty('thinkingLevel');
		expect(options.settingsManager.settings).not.toHaveProperty('defaultThinkingLevel');
		vi.doUnmock('@earendil-works/pi-coding-agent');
		vi.doUnmock('$lib/server/providers/runtime');
		vi.doUnmock('$lib/server/repositories/mcp');
	});

	it('passes explicit thinking options through to PI', async () => {
		vi.resetModules();
		const createAgentSession = vi.fn(async (options: Record<string, unknown>) => ({
			session: {
				agent: {
					state: { systemPrompt: '' },
					streamFn: vi.fn()
				},
				dispose: vi.fn()
			},
			extensionsResult: { extensions: [], errors: [], runtime: {} },
			options
		}));

		vi.doMock('@earendil-works/pi-coding-agent', () => ({
			createAgentSession,
			defineTool: (tool: unknown) => tool,
			SessionManager: {
				inMemory: () => ({ appendMessage: vi.fn() })
			},
			SettingsManager: {
				inMemory: (settings: unknown) => ({ settings })
			}
		}));
		vi.doMock('$lib/server/providers/runtime', () => ({
			createProviderRuntime: vi.fn(async () => ({
				provider: { providerId: 'mock-provider' },
				model: { id: 'mock-model' },
				thinkingLevel: 'high',
				authStorage: {},
				modelRegistry: {}
			}))
		}));
		vi.doMock('$lib/server/repositories/mcp', () => ({
			getEnabledMcpServerBySlug: vi.fn(),
			getMcpSecrets: vi.fn(() => ({})),
			listEnabledMcpServers: vi.fn(),
			markMcpServerStatus: vi.fn()
		}));

		const { createServerAgentSession } = await import('./runtime');
		await createServerAgentSession({ thinkingLevel: 'high' });
		const options = createAgentSession.mock.calls[0][0] as {
			thinkingLevel?: string;
			settingsManager: { settings: Record<string, unknown> };
		};

		expect(options.thinkingLevel).toBe('high');
		expect(options.settingsManager.settings.defaultThinkingLevel).toBe('high');
		vi.doUnmock('@earendil-works/pi-coding-agent');
		vi.doUnmock('$lib/server/providers/runtime');
		vi.doUnmock('$lib/server/repositories/mcp');
	});
});
