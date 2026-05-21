import { createAgentSession, SessionManager, SettingsManager } from '@earendil-works/pi-coding-agent';

import { buildProgressiveMcpToolDefinitions } from '$lib/server/mcp/adapter';
import { createProviderRuntime } from '$lib/server/providers/runtime';

import { appTools } from './tools';
import { createServerResourceLoader } from './resource-loader';
import { applySessionStreamSettings, applySessionSystemPrompt } from './session-settings';

export type AgentRuntimeInput = {
	providerConnectionId?: string | null;
	modelId?: string | null;
	thinkingLevel?: string | null;
	systemPrompt?: string;
	temperature?: number | null;
	history?: PersistedAgentMessage[];
};

export type PersistedAgentMessage = {
	role: string;
	content?: string | Array<{ type: string; text?: string; [key: string]: unknown }>;
	[key: string]: unknown;
};

export async function createServerAgentSession(input: AgentRuntimeInput = {}) {
	const provider = await createProviderRuntime(input);
	const sessionManager = SessionManager.inMemory(process.cwd());

	for (const message of input.history ?? []) {
		if (message.role === 'user' || message.role === 'assistant' || message.role === 'toolResult') {
			sessionManager.appendMessage(message as never);
		}
	}

	const mcpTools = buildProgressiveMcpToolDefinitions();
	const customTools = [...appTools, ...mcpTools];
	const allowedToolNames = customTools.map((tool) => tool.name);
	const settingsManager = SettingsManager.inMemory({
		defaultProvider: provider.row.providerId,
		defaultModel: provider.model.id,
		...(provider.thinkingLevel ? { defaultThinkingLevel: provider.thinkingLevel } : {}),
		compaction: { enabled: false }
	});

	const result = await createAgentSession({
		cwd: process.cwd(),
		authStorage: provider.authStorage,
		modelRegistry: provider.modelRegistry,
		model: provider.model,
		...(provider.thinkingLevel ? { thinkingLevel: provider.thinkingLevel } : {}),
		noTools: 'builtin',
		tools: allowedToolNames,
		customTools,
		resourceLoader: createServerResourceLoader(),
		sessionManager,
		settingsManager,
		sessionStartEvent: { type: 'session_start', reason: 'startup' }
	});
	applySessionSystemPrompt(result.session, input.systemPrompt ?? '');
	applySessionStreamSettings(result.session, input.temperature ?? null);

	return {
		...result,
		provider: provider.row,
		model: provider.model,
		thinkingLevel: provider.thinkingLevel,
		allowedToolNames
	};
}
