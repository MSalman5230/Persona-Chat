import { createAgentSession, SessionManager, SettingsManager } from '@earendil-works/pi-coding-agent';

import { buildMcpToolDefinitions } from '$lib/server/mcp/adapter';
import { createProviderRuntime } from '$lib/server/providers/runtime';
import {
	piSystemPromptFromSessionPrompt,
	providerSystemPromptFromPi,
	streamOptionsWithTemperature
} from '$lib/server/chat/settings';

import { appTools } from './tools';
import { createServerResourceLoader } from './resource-loader';

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

type AgentSessionResult = Awaited<ReturnType<typeof createAgentSession>>;
type AgentSession = AgentSessionResult['session'];
type AgentStreamFn = AgentSession['agent']['streamFn'];

function applySessionSystemPrompt(session: AgentSession, systemPrompt: string): void {
	const piSystemPrompt = piSystemPromptFromSessionPrompt(systemPrompt);
	session.agent.state.systemPrompt = piSystemPrompt;
	// AgentSession.prompt restores this base prompt before every turn.
	(session as unknown as { _baseSystemPrompt: string })._baseSystemPrompt = piSystemPrompt;
}

export function wrapStreamFnWithSessionSettings(
	streamFn: AgentStreamFn,
	temperature: number | null
): AgentStreamFn {
	return (model, context, options) =>
		streamFn(
			model,
			{
				...context,
				systemPrompt: providerSystemPromptFromPi(context.systemPrompt)
			},
			streamOptionsWithTemperature(options, temperature)
		);
}

function applySessionStreamSettings(session: AgentSession, temperature: number | null): void {
	session.agent.streamFn = wrapStreamFnWithSessionSettings(session.agent.streamFn, temperature);
}

export async function createServerAgentSession(input: AgentRuntimeInput = {}) {
	const provider = await createProviderRuntime(input);
	const sessionManager = SessionManager.inMemory(process.cwd());

	for (const message of input.history ?? []) {
		if (message.role === 'user' || message.role === 'assistant' || message.role === 'toolResult') {
			sessionManager.appendMessage(message as never);
		}
	}

	const mcpTools = await buildMcpToolDefinitions();
	const customTools = [...appTools, ...mcpTools];
	const allowedToolNames = customTools.map((tool) => tool.name);
	const settingsManager = SettingsManager.inMemory({
		defaultProvider: provider.row.providerId,
		defaultModel: provider.model.id,
		defaultThinkingLevel: provider.thinkingLevel,
		compaction: { enabled: false }
	});

	const result = await createAgentSession({
		cwd: process.cwd(),
		authStorage: provider.authStorage,
		modelRegistry: provider.modelRegistry,
		model: provider.model,
		thinkingLevel: provider.thinkingLevel,
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
