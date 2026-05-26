import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	deleteChatSession: vi.fn(),
	getAgent: vi.fn(),
	getChatSession: vi.fn(),
	listChatMessages: vi.fn(),
	requireUser: vi.fn(() => ({ id: 'user-1' })),
	resolveActiveChatRun: vi.fn(),
	updateChatSession: vi.fn()
}));

vi.mock('$lib/server/auth/guards', () => ({
	requireUser: mocks.requireUser
}));

vi.mock('$lib/server/repositories/chat', () => ({
	deleteChatSession: mocks.deleteChatSession,
	getChatSession: mocks.getChatSession,
	listChatMessages: mocks.listChatMessages,
	updateChatSession: mocks.updateChatSession
}));

vi.mock('$lib/server/repositories/agents', () => ({
	getAgent: mocks.getAgent,
	normalizeAgentIdForStorage: (id: string | null | undefined) =>
		id && id !== '00000000-0000-4000-8000-000000000000' ? id : null
}));

vi.mock('$lib/server/chat/runs', () => ({
	resolveActiveChatRun: mocks.resolveActiveChatRun
}));

import { DELETE, PATCH } from './+server';
import { PREBUILT_GENERAL_AGENT_ID } from '$lib/shared/prebuilt-general-agent';

const session = {
	id: '00000000-0000-4000-8000-000000000001',
	title: 'Planning'
};

function jsonRequest(body: unknown): Request {
	return new Request(`http://localhost/api/chat-sessions/${session.id}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
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
		const response = await PATCH({
			params: { id: session.id },
			request: jsonRequest(payload)
		} as never);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			session: {
				...session,
				...payload
			}
		});
		expect(mocks.updateChatSession).toHaveBeenCalledWith('user-1', session.id, payload);
	});

	it('stores the Prebuilt General Agent sentinel as null', async () => {
		const response = await PATCH({
			params: { id: session.id },
			request: jsonRequest({ agentId: PREBUILT_GENERAL_AGENT_ID })
		} as never);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			session: {
				agentId: PREBUILT_GENERAL_AGENT_ID
			}
		});
		expect(mocks.getAgent).not.toHaveBeenCalled();
		expect(mocks.updateChatSession).toHaveBeenCalledWith('user-1', session.id, { agentId: null });
	});

	it('rejects null agent settings because the client must send a concrete agent id', async () => {
		await expect(
			PATCH({
				params: { id: session.id },
				request: jsonRequest({ agentId: null })
			} as never)
		).rejects.toMatchObject({
			status: 400
		});
		expect(mocks.updateChatSession).not.toHaveBeenCalled();
	});

	it('returns 400 when the selected agent does not exist', async () => {
		mocks.getAgent.mockResolvedValue(undefined);
		const agentId = '00000000-0000-4000-8000-000000000099';

		await expect(
			PATCH({
				params: { id: session.id },
				request: jsonRequest({ agentId })
			} as never)
		).rejects.toMatchObject({
			status: 400,
			body: { message: 'Selected agent does not exist' }
		});
		expect(mocks.getAgent).toHaveBeenCalledWith('user-1', agentId);
		expect(mocks.updateChatSession).not.toHaveBeenCalled();
	});

	it('returns 404 when patching a missing chat session', async () => {
		mocks.getChatSession.mockResolvedValue(undefined);

		await expect(
			PATCH({
				params: { id: session.id },
				request: jsonRequest({ agentId: PREBUILT_GENERAL_AGENT_ID })
			} as never)
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
		const response = await DELETE({ params: { id: session.id } } as never);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ ok: true });
		expect(mocks.deleteChatSession).toHaveBeenCalledWith('user-1', session.id);
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
