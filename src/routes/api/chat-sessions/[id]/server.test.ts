import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	deleteChatSession: vi.fn(),
	getChatSession: vi.fn(),
	listChatMessages: vi.fn(),
	resolveActiveChatRun: vi.fn(),
	updateChatSession: vi.fn()
}));

vi.mock('$lib/server/repositories/chat', () => ({
	deleteChatSession: mocks.deleteChatSession,
	getChatSession: mocks.getChatSession,
	listChatMessages: mocks.listChatMessages,
	updateChatSession: mocks.updateChatSession
}));

vi.mock('$lib/server/chat/runs', () => ({
	resolveActiveChatRun: mocks.resolveActiveChatRun
}));

import { DELETE } from './+server';

const session = {
	id: '00000000-0000-4000-8000-000000000001',
	title: 'Planning'
};

describe('chat session DELETE route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getChatSession.mockResolvedValue(session);
		mocks.resolveActiveChatRun.mockResolvedValue({ activeRun: null, interruptedRun: null });
	});

	it('deletes an inactive chat session', async () => {
		const response = await DELETE({ params: { id: session.id } } as never);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ ok: true });
		expect(mocks.deleteChatSession).toHaveBeenCalledWith(session.id);
	});

	it('returns 404 when the chat session does not exist', async () => {
		mocks.getChatSession.mockResolvedValue(undefined);

		await expect(DELETE({ params: { id: session.id } } as never)).rejects.toMatchObject({
			status: 404,
			body: { message: 'Chat session not found' }
		});
		expect(mocks.resolveActiveChatRun).not.toHaveBeenCalled();
		expect(mocks.deleteChatSession).not.toHaveBeenCalled();
	});

	it('returns 409 when the chat session is streaming', async () => {
		mocks.resolveActiveChatRun.mockResolvedValue({
			activeRun: {
				id: '00000000-0000-4000-8000-000000000002',
				sessionId: session.id,
				status: 'running',
				errorText: null,
				startedAt: new Date('2026-05-21T00:00:00.000Z'),
				completedAt: null
			},
			interruptedRun: null
		});

		await expect(DELETE({ params: { id: session.id } } as never)).rejects.toMatchObject({
			status: 409,
			body: { message: 'Wait for the response to finish before deleting this chat' }
		});
		expect(mocks.deleteChatSession).not.toHaveBeenCalled();
	});
});
