import { describe, expect, it, vi } from 'vitest';

import { BLANK_SYSTEM_PROMPT_SENTINEL } from '$lib/server/chat/settings';
import type { Agent } from '$lib/server/agents';

import { wrapStreamFnWithSessionSettings } from './session-settings';

type RuntimeTestAgent = Pick<
	Agent,
	'systemPrompt' | 'toolNames' | 'mcpServerIds' | 'toolAccess' | 'mcpServerAccess'
>;

function runtimeAgent(overrides: Partial<RuntimeTestAgent> = {}): RuntimeTestAgent {
	return {
		systemPrompt: 'General prompt.',
		toolNames: [],
		mcpServerIds: [],
		toolAccess: 'all',
		mcpServerAccess: 'all',
		...overrides
	};
}

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
				row: { providerId: 'mock-provider' },
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
			agent: runtimeAgent(),
			history: [{ role: 'assistant', content: [{ type: 'text', text: 'Earlier answer.' }] }]
		});

		expect(appendedMessages[0]).toMatchObject({
			role: 'assistant',
			content: [{ type: 'text', text: 'Earlier answer.' }]
		});
		expect(appendedMessages).toHaveLength(1);
		vi.doUnmock('@earendil-works/pi-coding-agent');
		vi.doUnmock('$lib/server/providers/runtime');
		vi.doUnmock('$lib/server/repositories/mcp');
	});

	it('starts an all-access agent with stable progressive MCP meta-tools only', async () => {
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
				row: { providerId: 'mock-provider' },
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
		const runtime = await createServerAgentSession({ agent: runtimeAgent() });
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
				row: { providerId: 'mock-provider' },
				model: { id: 'mock-model' },
				thinkingLevel: undefined,
				authStorage: {},
				modelRegistry: {}
			}))
		}));
		const allowedMcpServer = {
			id: '00000000-0000-4000-8000-000000000010',
			name: 'Allowed',
			slug: 'allowed',
			transport: 'stdio',
			status: 'ok',
			lastError: null,
			lastCheckedAt: null,
			updatedAt: new Date('2026-05-25T00:00:00.000Z'),
			command: 'node',
			url: null
		};
		const blockedMcpServer = {
			...allowedMcpServer,
			id: '00000000-0000-4000-8000-000000000011',
			name: 'Blocked',
			slug: 'blocked'
		};
		const getEnabledMcpServerBySlug = vi.fn(async (slug: string) =>
			[allowedMcpServer, blockedMcpServer].find((server) => server.slug === slug)
		);
		const listEnabledMcpServers = vi.fn(async () => [allowedMcpServer, blockedMcpServer]);
		vi.doMock('$lib/server/repositories/mcp', () => ({
			getEnabledMcpServerBySlug,
			getMcpSecrets: vi.fn(() => ({})),
			listEnabledMcpServers,
			markMcpServerStatus: vi.fn()
		}));

		const { createServerAgentSession } = await import('./runtime');
		const runtime = await createServerAgentSession({
			agent: {
				systemPrompt: 'Agent prompt.',
				toolNames: ['current_datetime'],
				mcpServerIds: ['00000000-0000-4000-8000-000000000010'],
				toolAccess: 'selected',
				mcpServerAccess: 'selected'
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
		const listServersTool = options.customTools.find((tool) => tool.name === 'mcp_list_servers') as unknown as {
			execute: (...args: unknown[]) => Promise<{ details: { servers: Array<{ slug: string }> } }>;
		};
		const listToolsTool = options.customTools.find((tool) => tool.name === 'mcp_list_tools') as unknown as {
			execute: (...args: unknown[]) => Promise<unknown>;
		};
		const listResult = await listServersTool.execute('call-1', {});
		expect(listResult.details.servers.map((server) => server.slug)).toEqual(['allowed']);
		await expect(listToolsTool.execute('call-2', { server: 'blocked' })).rejects.toThrow(
			'Enabled MCP server not found: blocked'
		);
		expect(getEnabledMcpServerBySlug).toHaveBeenCalledWith('blocked');
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
				row: { providerId: 'mock-provider' },
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
				mcpServerIds: [],
				toolAccess: 'selected',
				mcpServerAccess: 'selected'
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

	it('keeps unrestricted tools for an all-access agent', async () => {
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
				row: { providerId: 'mock-provider' },
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
				systemPrompt: 'General prompt.',
				toolNames: [],
				mcpServerIds: [],
				toolAccess: 'all',
				mcpServerAccess: 'all'
			}
		});
		const options = createAgentSession.mock.calls[0][0] as {
			tools: string[];
			customTools: Array<{ name: string }>;
		};

		expect(options.customTools.map((tool) => tool.name)).toEqual([
			'current_datetime',
			'sandbox_run_code',
			'mcp_list_servers',
			'mcp_list_tools',
			'mcp_call_tool'
		]);
		expect(runtime.allowedToolNames).toEqual(options.tools);
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
				row: { providerId: 'mock-provider' },
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
		await createServerAgentSession({ agent: runtimeAgent(), thinkingLevel: null });
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
				row: { providerId: 'mock-provider' },
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
		await createServerAgentSession({ agent: runtimeAgent(), thinkingLevel: 'high' });
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
