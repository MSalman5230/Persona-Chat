import type { createAgentSession } from '@earendil-works/pi-coding-agent';

import {
	piSystemPromptFromSessionPrompt,
	providerSystemPromptFromPi,
	streamOptionsWithTemperature
} from '$lib/server/chat/settings';

type AgentSessionResult = Awaited<ReturnType<typeof createAgentSession>>;
type AgentSession = AgentSessionResult['session'];
type AgentStreamFn = AgentSession['agent']['streamFn'];

export function applySessionSystemPrompt(session: AgentSession, systemPrompt: string): void {
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

export function applySessionStreamSettings(session: AgentSession, temperature: number | null): void {
	session.agent.streamFn = wrapStreamFnWithSessionSettings(session.agent.streamFn, temperature);
}
