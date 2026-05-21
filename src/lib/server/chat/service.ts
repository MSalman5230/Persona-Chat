import { createServerAgentSession } from '$lib/server/agent/runtime';
import type { PersistedAgentMessage } from '$lib/server/agent/runtime';
import {
	appendChatMessages,
	createChatSession,
	getChatSession,
	listChatMessages,
	updateChatSession
} from '$lib/server/repositories/chat';
import {
	normalizeAgentMessageForStorage,
	type AgentMessage,
	type ThoughtTimingsByAssistant
} from './display';

function titleFromPrompt(prompt: string): string {
	const cleaned = prompt.replace(/\s+/g, ' ').trim();
	if (!cleaned) return 'New chat';
	return cleaned.length > 56 ? `${cleaned.slice(0, 53)}...` : cleaned;
}

export async function prepareChatTurn(input: {
	sessionId?: string | null;
	message: string;
	providerConnectionId?: string | null;
	modelId?: string | null;
	thinkingLevel?: string | null;
	systemPrompt?: string;
	temperature?: number | null;
}) {
	const existing = input.sessionId ? await getChatSession(input.sessionId) : undefined;
	const historyRows = existing ? await listChatMessages(existing.id) : [];
	const history = historyRows.map((row) => row.piMessage as unknown as AgentMessage);
	const systemPrompt = input.systemPrompt ?? existing?.systemPrompt ?? '';
	const temperature = input.temperature !== undefined ? input.temperature : (existing?.temperature ?? null);
	const runtime = await createServerAgentSession({
		providerConnectionId: input.providerConnectionId ?? existing?.providerConnectionId,
		modelId: input.modelId ?? existing?.modelId,
		thinkingLevel: input.thinkingLevel ?? existing?.thinkingLevel,
		systemPrompt,
		temperature,
		history
	});

	let chatSession =
		existing ??
		(await createChatSession({
			title: titleFromPrompt(input.message),
			providerConnectionId: runtime.provider.id,
			providerId: runtime.provider.providerId,
			modelId: runtime.model.id,
			thinkingLevel: runtime.thinkingLevel,
			systemPrompt,
			temperature
		}));

	if (existing) {
		await updateChatSession(existing.id, {
			providerConnectionId: runtime.provider.id,
			providerId: runtime.provider.providerId,
			modelId: runtime.model.id,
			thinkingLevel: runtime.thinkingLevel,
			systemPrompt,
			temperature
		});
		chatSession = {
			...existing,
			providerConnectionId: runtime.provider.id,
			providerId: runtime.provider.providerId,
			modelId: runtime.model.id,
			thinkingLevel: runtime.thinkingLevel,
			systemPrompt,
			temperature
		};
	}

	return {
		chatSession,
		runtime,
		historyCount: history.length
	};
}

export async function persistAgentMessages(
	sessionId: string,
	messages: AgentMessage[],
	historyCount: number,
	thoughtTimings?: ThoughtTimingsByAssistant
): Promise<void> {
	const newMessages = messages.slice(historyCount);
	let assistantIndex = -1;

	await appendChatMessages(
		sessionId,
		newMessages.map((message) => {
			const timings = message.role === 'assistant' ? thoughtTimings?.get(++assistantIndex) : undefined;
			return normalizeAgentMessageForStorage(message, timings);
		})
	);
}
