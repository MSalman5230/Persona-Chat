import { asc, desc, eq, max } from 'drizzle-orm';

import { db } from '$lib/server/db';
import { chatMessages, chatSessions } from '$lib/server/db/schema';

export type ChatSessionRow = typeof chatSessions.$inferSelect;
export type ChatMessageRow = typeof chatMessages.$inferSelect;

export async function listChatSessions(): Promise<ChatSessionRow[]> {
	return db.select().from(chatSessions).orderBy(desc(chatSessions.updatedAt)).limit(30);
}

export async function getChatSession(id: string): Promise<ChatSessionRow | undefined> {
	const [row] = await db.select().from(chatSessions).where(eq(chatSessions.id, id)).limit(1);
	return row;
}

export async function createChatSession(input: {
	title: string;
	providerConnectionId: string | null;
	providerId: string | null;
	modelId: string | null;
	thinkingLevel: string;
	systemPrompt: string;
	temperature: number | null;
}): Promise<ChatSessionRow> {
	const [row] = await db
		.insert(chatSessions)
		.values({
			title: input.title || 'New chat',
			providerConnectionId: input.providerConnectionId,
			providerId: input.providerId,
			modelId: input.modelId,
			thinkingLevel: input.thinkingLevel,
			systemPrompt: input.systemPrompt,
			temperature: input.temperature
		})
		.returning();
	return row;
}

export async function updateChatSession(
	id: string,
	input: Partial<{
		title: string;
		providerConnectionId: string | null;
		providerId: string | null;
		modelId: string | null;
		thinkingLevel: string;
		systemPrompt: string;
		temperature: number | null;
	}>
): Promise<void> {
	await db
		.update(chatSessions)
		.set({ ...input, updatedAt: new Date() })
		.where(eq(chatSessions.id, id));
}

export async function listChatMessages(sessionId: string): Promise<ChatMessageRow[]> {
	return db
		.select()
		.from(chatMessages)
		.where(eq(chatMessages.sessionId, sessionId))
		.orderBy(asc(chatMessages.sequence));
}

export async function appendChatMessages(
	sessionId: string,
	messages: Array<{
		role: string;
		contentText: string;
		piMessage: Record<string, unknown>;
		display?: Record<string, unknown>;
	}>
): Promise<void> {
	if (messages.length === 0) return;

	const [{ value: currentMax }] = await db
		.select({ value: max(chatMessages.sequence) })
		.from(chatMessages)
		.where(eq(chatMessages.sessionId, sessionId));

	const start = currentMax ?? 0;
	await db.insert(chatMessages).values(
		messages.map((message, index) => ({
			sessionId,
			sequence: start + index + 1,
			role: message.role,
			contentText: message.contentText,
			piMessage: message.piMessage,
			display: message.display ?? {}
		}))
	);
	await db.update(chatSessions).set({ updatedAt: new Date() }).where(eq(chatSessions.id, sessionId));
}
