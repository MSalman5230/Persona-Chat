import { createServerAgentSession } from '$lib/server/agent/runtime';
import {
	createChatSession,
	getChatSession,
	listChatMessages,
	updateChatSession,
	upsertChatMessages,
	type ChatMessageRow
} from '$lib/server/repositories/chat';
import {
	getDefaultAgent,
	normalizeAgentIdForStorage,
	resolveAgentSelection
} from '$lib/server/repositories/agents';
import { getEffectiveUserSettings } from '$lib/server/repositories/user-settings';
import {
	hydrateChatMessageDisplay,
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
	userId: string;
	sessionId?: string | null;
	message: string;
	agentId?: string;
	providerConnectionId?: string | null;
	modelId?: string | null;
	thinkingLevel?: string | null;
	temperature?: number | null;
}) {
	const existing = input.sessionId ? await getChatSession(input.userId, input.sessionId) : undefined;
	if (input.sessionId && !existing) throw new Error('Chat session not found');
	const historyRows = existing ? await listChatMessages(existing.id) : [];
	const history = historyRows.map((row) => row.piMessage);
	const defaultAgent = !existing && input.agentId === undefined ? await getDefaultAgent(input.userId) : null;
	const requestedAgentId =
		input.agentId !== undefined ? input.agentId : (existing ? existing.agentId : defaultAgent?.id);
	const agent = await resolveAgentSelection(input.userId, requestedAgentId);
	if (!agent) throw new Error('Agent not found');
	const agentId = normalizeAgentIdForStorage(agent.id);
	const defaults = existing ? null : await getEffectiveUserSettings(input.userId);
	const temperature = input.temperature !== undefined ? input.temperature : (existing?.temperature ?? null);
	const thinkingLevel =
		input.thinkingLevel !== undefined
			? input.thinkingLevel
			: (existing?.thinkingLevel ?? defaults?.defaultThinkingLevel ?? null);
	const runtime = await createServerAgentSession({
		userId: input.userId,
		providerConnectionId:
			input.providerConnectionId ?? existing?.providerConnectionId ?? defaults?.defaultProviderId,
		modelId: input.modelId ?? existing?.modelId,
		thinkingLevel,
		agent,
		temperature,
		history
	});

	let chatSession =
		existing ??
		(await createChatSession({
			userId: input.userId,
			title: titleFromPrompt(input.message),
			agentId,
			providerConnectionId: runtime.provider.id,
			providerId: runtime.provider.providerId,
			modelId: runtime.model.id,
			thinkingLevel,
			temperature
		}));

	if (existing) {
		await updateChatSession(input.userId, existing.id, {
			agentId,
			providerConnectionId: runtime.provider.id,
			providerId: runtime.provider.providerId,
			modelId: runtime.model.id,
			thinkingLevel,
			temperature
		});
		chatSession = {
			...existing,
			agentId,
			providerConnectionId: runtime.provider.id,
			providerId: runtime.provider.providerId,
			modelId: runtime.model.id,
			thinkingLevel,
			temperature
		};
	}

	return {
		chatSession,
		runtime,
		historyCount: history.length
	};
}

export async function upsertAgentMessages(
	sessionId: string,
	messages: AgentMessage[],
	historyCount: number,
	thoughtTimings?: ThoughtTimingsByAssistant,
	storedMessagesBySequence?: Map<number, { display?: unknown }>,
	startSequence = historyCount + 1
): Promise<void> {
	const newMessages = messages.slice(historyCount);
	let assistantIndex = -1;

	await upsertChatMessages(
		sessionId,
		startSequence,
		newMessages.map((message, index) => {
			const sequence = startSequence + index;
			const timings = message.role === 'assistant' ? thoughtTimings?.get(++assistantIndex) : undefined;
			return normalizeAgentMessageForStorage(
				message,
				timings,
				storedMessagesBySequence?.get(sequence)?.display
			);
		})
	);
}

export function serializeChatMessage(message: ChatMessageRow): Record<string, unknown> {
	const display = hydrateChatMessageDisplay(message.piMessage, message.display);

	return {
		id: message.id,
		sequence: message.sequence,
		role: message.role,
		text: display.text,
		display,
		...(typeof message.piMessage.toolName === 'string' ? { toolName: message.piMessage.toolName } : {}),
		createdAt: message.createdAt
	};
}

export function serializeChatMessages(messages: ChatMessageRow[]): Record<string, unknown>[] {
	return messages.map(serializeChatMessage);
}
