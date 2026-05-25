import { createAgentSession, SessionManager, SettingsManager } from '@earendil-works/pi-coding-agent';

import { buildProgressiveMcpToolDefinitions } from '$lib/server/mcp/adapter';
import { getEnabledMcpServerBySlug, listEnabledMcpServers } from '$lib/server/repositories/mcp';
import { createProviderRuntime } from '$lib/server/providers/runtime';
import type { Agent } from '$lib/server/agents';

import { appTools } from './tools';
import { createServerResourceLoader } from './resource-loader';
import { applySessionStreamSettings, applySessionSystemPrompt } from './session-settings';

export type AgentRuntimeInput = {
	providerConnectionId?: string | null;
	modelId?: string | null;
	thinkingLevel?: string | null;
	agent?: Pick<Agent, 'systemPrompt' | 'toolNames' | 'mcpServerIds'> | null;
	systemPrompt?: string;
	temperature?: number | null;
	history?: PersistedAgentMessage[];
};

export type PersistedAgentMessage = {
	role: string;
	content?: string | Array<{ type: string; text?: string; [key: string]: unknown }>;
	[key: string]: unknown;
};

function appToolsForAgent(agent: AgentRuntimeInput['agent']) {
	if (!agent) return appTools;
	const allowed = new Set(agent.toolNames);
	return appTools.filter((tool) => allowed.has(tool.name));
}

function mcpToolsForAgent(agent: AgentRuntimeInput['agent']) {
	if (!agent) return buildProgressiveMcpToolDefinitions();
	if (agent.mcpServerIds.length === 0) return [];

	const allowedServerIds = new Set(agent.mcpServerIds);
	return buildProgressiveMcpToolDefinitions({
		listEnabledServers: async () =>
			(await listEnabledMcpServers()).filter((server) => allowedServerIds.has(server.id)),
		getEnabledServerBySlug: async (slug) => {
			const server = await getEnabledMcpServerBySlug(slug);
			return server && allowedServerIds.has(server.id) ? server : undefined;
		}
	});
}

export async function createServerAgentSession(input: AgentRuntimeInput = {}) {
	const provider = await createProviderRuntime(input);
	const sessionManager = SessionManager.inMemory(process.cwd());

	for (const message of input.history ?? []) {
		if (message.role === 'user' || message.role === 'assistant' || message.role === 'toolResult') {
			sessionManager.appendMessage(message as never);
		}
	}

	const customTools = [...appToolsForAgent(input.agent), ...mcpToolsForAgent(input.agent)];
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
	applySessionSystemPrompt(result.session, input.agent?.systemPrompt ?? input.systemPrompt ?? '');
	applySessionStreamSettings(result.session, input.temperature ?? null);

	return {
		...result,
		provider: provider.row,
		model: provider.model,
		thinkingLevel: provider.thinkingLevel,
		allowedToolNames
	};
}
