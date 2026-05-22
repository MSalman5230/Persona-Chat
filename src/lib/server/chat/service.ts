import { createServerAgentSession } from '$lib/server/agent/runtime';
import type { PersistedAgentMessage } from '$lib/server/agent/runtime';
import {
	createChatSession,
	getChatSession,
	listChatMessages,
	updateChatSession,
	upsertChatMessages,
	type ChatMessageInput,
	type ChatMessageRow
} from '$lib/server/repositories/chat';
import { mergeChatMessageDisplay } from '$lib/shared/chat-display';
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
	const thinkingLevel =
		input.thinkingLevel !== undefined ? input.thinkingLevel : (existing?.thinkingLevel ?? null);
	const runtime = await createServerAgentSession({
		providerConnectionId: input.providerConnectionId ?? existing?.providerConnectionId,
		modelId: input.modelId ?? existing?.modelId,
		thinkingLevel,
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
			thinkingLevel,
			systemPrompt,
			temperature
		}));

	if (existing) {
		await updateChatSession(existing.id, {
			providerConnectionId: runtime.provider.id,
			providerId: runtime.provider.providerId,
			modelId: runtime.model.id,
			thinkingLevel,
			systemPrompt,
			temperature
		});
		chatSession = {
			...existing,
			providerConnectionId: runtime.provider.id,
			providerId: runtime.provider.providerId,
			modelId: runtime.model.id,
			thinkingLevel,
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

export async function upsertAgentMessages(
	sessionId: string,
	messages: AgentMessage[],
	historyCount: number,
	thoughtTimings?: ThoughtTimingsByAssistant,
	preservedDisplaysBySequence?: Map<number, Record<string, unknown> | undefined>
): Promise<void> {
	const newMessages = messages.slice(historyCount);
	let assistantIndex = -1;

	await upsertChatMessages(
		sessionId,
		historyCount + 1,
		newMessages.map((message, index): ChatMessageInput => {
			const timings = message.role === 'assistant' ? thoughtTimings?.get(++assistantIndex) : undefined;
			const stored = normalizeAgentMessageForStorage(message, timings);
			const sequence = historyCount + index + 1;
			const preservedDisplay = preservedDisplaysBySequence?.get(sequence);
			const display = preservedDisplay
				? mergeChatMessageDisplay(stored.display, preservedDisplay)
				: stored.display;

			return {
				...stored,
				display: display as unknown as Record<string, unknown>
			};
		})
	);
}

export function serializeChatMessage(message: ChatMessageRow): Record<string, unknown> {
	const piMessage = message.piMessage as unknown as PersistedAgentMessage;
	const display = hydrateChatMessageDisplay(piMessage, message.display);

	return {
		id: message.id,
		sequence: message.sequence,
		role: message.role,
		text: display.text,
		display,
		...(typeof piMessage.toolName === 'string' ? { toolName: piMessage.toolName } : {}),
		...(typeof piMessage.toolCallId === 'string' ? { toolCallId: piMessage.toolCallId } : {}),
		...(typeof piMessage.isError === 'boolean' ? { isError: piMessage.isError } : {}),
		createdAt: message.createdAt
	};
}

export function serializeChatMessages(messages: ChatMessageRow[]): Record<string, unknown>[] {
	return messages.map(serializeChatMessage);
}
