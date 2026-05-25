import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	deleteChatSession: vi.fn(),
	getAgent: vi.fn(),
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

vi.mock('$lib/server/repositories/agents', () => ({
	getAgent: mocks.getAgent
}));

vi.mock('$lib/server/chat/runs', () => ({
	resolveActiveChatRun: mocks.resolveActiveChatRun
}));

import { DELETE, PATCH } from './+server';

const session = {
	id: '00000000-0000-4000-8000-000000000001',
	userId: 'user-1',
	title: 'Planning'
};

const userId = session.userId;

function jsonRequest(body: unknown): Request {
	return new Request(`http://localhost/api/chat-sessions/${session.id}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
}

function eventWithUser(overrides: Record<string, unknown>) {
	return {
		...overrides,
		locals: {
			user: { id: userId, role: 'user' },
			session: { id: 'session-1' },
			isAdmin: false
		}
	};
}

describe('chat session PATCH route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getAgent.mockResolvedValue({
			id: '00000000-0000-4000-8000-000000000003',
			name: 'Researcher',
			systemPrompt: '',
			toolNames: [],
			mcpServerIds: [],
			isDefault: false,
			createdAt: new Date('2026-05-21T00:00:00.000Z'),
			updatedAt: new Date('2026-05-21T00:00:00.000Z')
		});
		mocks.getChatSession.mockResolvedValue(session);
		mocks.updateChatSession.mockResolvedValue(undefined);
	});

	it('updates agent and temperature settings', async () => {
		const payload = {
			agentId: '00000000-0000-4000-8000-000000000003',
			temperature: null
		};
		const response = await PATCH(eventWithUser({
			params: { id: session.id },
			request: jsonRequest(payload)
		}) as never);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			session: {
				...session,
				...payload
			}
		});
		expect(mocks.getChatSession).toHaveBeenCalledWith(userId, session.id);
		expect(mocks.updateChatSession).toHaveBeenCalledWith(userId, session.id, payload);
	});

	it('clears the selected agent without validating an agent record', async () => {
		const response = await PATCH(eventWithUser({
			params: { id: session.id },
			request: jsonRequest({ agentId: null })
		}) as never);

		expect(response.status).toBe(200);
		expect(mocks.getAgent).not.toHaveBeenCalled();
		expect(mocks.updateChatSession).toHaveBeenCalledWith(userId, session.id, { agentId: null });
	});

	it('returns 400 when the selected agent does not exist', async () => {
		mocks.getAgent.mockResolvedValue(undefined);
		const agentId = '00000000-0000-4000-8000-000000000099';

		await expect(
			PATCH(eventWithUser({
				params: { id: session.id },
				request: jsonRequest({ agentId })
			}) as never)
		).rejects.toMatchObject({
			status: 400,
			body: { message: 'Selected agent does not exist' }
		});
		expect(mocks.getAgent).toHaveBeenCalledWith(userId, agentId);
		expect(mocks.updateChatSession).not.toHaveBeenCalled();
	});

	it('returns 404 when patching a missing chat session', async () => {
		mocks.getChatSession.mockResolvedValue(undefined);

		await expect(
			PATCH(eventWithUser({
				params: { id: session.id },
				request: jsonRequest({ agentId: null })
			}) as never)
		).rejects.toMatchObject({
			status: 404,
			body: { message: 'Chat session not found' }
		});
		expect(mocks.updateChatSession).not.toHaveBeenCalled();
	});
});

describe('chat session DELETE route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getChatSession.mockResolvedValue(session);
		mocks.resolveActiveChatRun.mockResolvedValue({ activeRun: null, interruptedRun: null });
	});

	it('deletes an inactive chat session', async () => {
		const response = await DELETE(eventWithUser({ params: { id: session.id } }) as never);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ ok: true });
		expect(mocks.getChatSession).toHaveBeenCalledWith(userId, session.id);
		expect(mocks.deleteChatSession).toHaveBeenCalledWith(userId, session.id);
	});

	it('returns 404 when the chat session does not exist', async () => {
		mocks.getChatSession.mockResolvedValue(undefined);

		await expect(DELETE(eventWithUser({ params: { id: session.id } }) as never)).rejects.toMatchObject({
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

		await expect(DELETE(eventWithUser({ params: { id: session.id } }) as never)).rejects.toMatchObject({
			status: 409,
			body: { message: 'Wait for the response to finish before deleting this chat' }
		});
		expect(mocks.deleteChatSession).not.toHaveBeenCalled();
	});
});
