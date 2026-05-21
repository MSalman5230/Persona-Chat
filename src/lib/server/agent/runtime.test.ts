import { describe, expect, it, vi } from 'vitest';

import { BLANK_SYSTEM_PROMPT_SENTINEL } from '$lib/server/chat/settings';

import { wrapStreamFnWithSessionSettings } from './session-settings';

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
