import { and, asc, desc, eq } from 'drizzle-orm';

import { db } from '$lib/server/db';
import { chatMessages, chatRuns, chatSessions } from '$lib/server/db/schema';
import type { PersistedAgentMessage } from '$lib/server/agent/messages';
import type { ChatMessageDisplay } from '$lib/shared/chat-display';

export type ChatSessionRow = typeof chatSessions.$inferSelect;
export type ChatMessageRow = typeof chatMessages.$inferSelect;
export type ChatRunRow = typeof chatRuns.$inferSelect;
export type ChatRunStatus = 'running' | 'completed' | 'failed' | 'interrupted';

export type ChatMessageInput = {
	role: string;
	contentText: string;
	piMessage: PersistedAgentMessage;
	display?: ChatMessageDisplay;
};

function fallbackDisplay(message: ChatMessageInput): ChatMessageDisplay {
	return {
		role: message.role,
		text: message.contentText,
		thoughts: [],
		tools: []
	};
}

export async function listChatSessions(userId: string): Promise<ChatSessionRow[]> {
	return db
		.select()
		.from(chatSessions)
		.where(eq(chatSessions.userId, userId))
		.orderBy(desc(chatSessions.updatedAt))
		.limit(30);
}

export async function getChatSession(userId: string, id: string): Promise<ChatSessionRow | undefined> {
	const [row] = await db
		.select()
		.from(chatSessions)
		.where(and(eq(chatSessions.userId, userId), eq(chatSessions.id, id)))
		.limit(1);
	return row;
}

export async function createChatSession(input: {
	userId: string;
	title: string;
	agentId: string | null;
	providerConnectionId: string | null;
	providerId: string | null;
	modelId: string | null;
	thinkingLevel: string | null;
	temperature: number | null;
}): Promise<ChatSessionRow> {
	const [row] = await db
		.insert(chatSessions)
		.values({
			userId: input.userId,
			title: input.title || 'New chat',
			agentId: input.agentId,
			providerConnectionId: input.providerConnectionId,
			providerId: input.providerId,
			modelId: input.modelId,
			thinkingLevel: input.thinkingLevel,
			temperature: input.temperature
		})
		.returning();
	return row;
}

export async function updateChatSession(
	userId: string,
	id: string,
	input: Partial<{
		title: string;
		agentId: string | null;
		providerConnectionId: string | null;
		providerId: string | null;
		modelId: string | null;
		thinkingLevel: string | null;
		temperature: number | null;
	}>
): Promise<void> {
	await db
		.update(chatSessions)
		.set({ ...input, updatedAt: new Date() })
		.where(and(eq(chatSessions.userId, userId), eq(chatSessions.id, id)));
}

export async function deleteChatSession(userId: string, id: string): Promise<void> {
	await db
		.delete(chatSessions)
		.where(and(eq(chatSessions.userId, userId), eq(chatSessions.id, id)));
}

export async function listChatMessages(sessionId: string): Promise<ChatMessageRow[]> {
	return db
		.select()
		.from(chatMessages)
		.where(eq(chatMessages.sessionId, sessionId))
		.orderBy(asc(chatMessages.sequence));
}

export async function upsertChatMessage(
	sessionId: string,
	sequence: number,
	message: ChatMessageInput
): Promise<void> {
	await db
		.insert(chatMessages)
		.values({
			sessionId,
			sequence,
			role: message.role,
			contentText: message.contentText,
			piMessage: message.piMessage,
			display: message.display ?? fallbackDisplay(message)
		})
		.onConflictDoUpdate({
			target: [chatMessages.sessionId, chatMessages.sequence],
			set: {
				role: message.role,
				contentText: message.contentText,
				piMessage: message.piMessage,
				display: message.display ?? fallbackDisplay(message)
			}
		});
	await db.update(chatSessions).set({ updatedAt: new Date() }).where(eq(chatSessions.id, sessionId));
}

export async function upsertChatMessages(
	sessionId: string,
	startSequence: number,
	messages: ChatMessageInput[]
): Promise<void> {
	for (const [index, message] of messages.entries()) {
		await upsertChatMessage(sessionId, startSequence + index, message);
	}
}

export async function createChatRun(sessionId: string): Promise<ChatRunRow> {
	const [row] = await db.insert(chatRuns).values({ sessionId }).returning();
	return row;
}

export async function getChatRun(id: string): Promise<ChatRunRow | undefined> {
	const [row] = await db.select().from(chatRuns).where(eq(chatRuns.id, id)).limit(1);
	return row;
}

export async function getActiveChatRunForSession(
	sessionId: string
): Promise<ChatRunRow | undefined> {
	const [row] = await db
		.select()
		.from(chatRuns)
		.where(and(eq(chatRuns.sessionId, sessionId), eq(chatRuns.status, 'running')))
		.orderBy(desc(chatRuns.createdAt))
		.limit(1);
	return row;
}

export async function updateChatRunStatus(
	id: string,
	status: Exclude<ChatRunStatus, 'running'>,
	errorText?: string | null
): Promise<void> {
	await db
		.update(chatRuns)
		.set({
			status,
			errorText: errorText ?? null,
			completedAt: new Date(),
			updatedAt: new Date()
		})
		.where(eq(chatRuns.id, id));
}
