import { createServerAgentSession } from '$lib/server/agent/runtime';
import type { PersistedAgentMessage } from '$lib/server/agent/runtime';
import {
	appendChatMessages,
	createChatSession,
	getChatSession,
	listChatMessages,
	updateChatSession
} from '$lib/server/repositories/chat';

type AgentMessage = PersistedAgentMessage;

function messageText(message: AgentMessage): string {
	if ('content' in message) {
		const content = message.content;
		if (typeof content === 'string') return content;
		if (Array.isArray(content)) {
			return content
				.map((item) => (item.type === 'text' ? item.text : `[${item.type}]`))
				.join('\n')
				.trim();
		}
	}
	return '';
}

function normalizeMessage(message: AgentMessage) {
	return {
		role: message.role,
		contentText: messageText(message),
		piMessage: message as unknown as Record<string, unknown>,
		display: {
			role: message.role,
			text: messageText(message)
		}
	};
}

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
}) {
	const existing = input.sessionId ? await getChatSession(input.sessionId) : undefined;
	const historyRows = existing ? await listChatMessages(existing.id) : [];
	const history = historyRows.map((row) => row.piMessage as unknown as AgentMessage);
	const runtime = await createServerAgentSession({
		providerConnectionId: input.providerConnectionId ?? existing?.providerConnectionId,
		modelId: input.modelId ?? existing?.modelId,
		thinkingLevel: input.thinkingLevel ?? existing?.thinkingLevel,
		history
	});

	const chatSession =
		existing ??
		(await createChatSession({
			title: titleFromPrompt(input.message),
			providerConnectionId: runtime.provider.id,
			providerId: runtime.provider.providerId,
			modelId: runtime.model.id,
			thinkingLevel: runtime.thinkingLevel
		}));

	if (existing) {
		await updateChatSession(existing.id, {
			providerConnectionId: runtime.provider.id,
			providerId: runtime.provider.providerId,
			modelId: runtime.model.id,
			thinkingLevel: runtime.thinkingLevel
		});
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
	historyCount: number
): Promise<void> {
	const newMessages = messages.slice(historyCount);
	await appendChatMessages(sessionId, newMessages.map(normalizeMessage));
}

export function normalizeAgentEvent(event: unknown): Record<string, unknown> {
	if (!event || typeof event !== 'object') return { type: 'unknown', event };
	const record = event as Record<string, unknown>;
	const message = record.message as AgentMessage | undefined;

	return {
		type: record.type,
		message:
			message && typeof message === 'object'
				? {
						role: message.role,
						text: messageText(message),
						raw: message
					}
				: undefined,
		toolName: record.toolName ?? record.name,
		toolCallId: record.toolCallId,
		error: record.error,
		willRetry: record.willRetry
	};
}
