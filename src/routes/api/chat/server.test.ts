import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	class ActiveChatRunError extends Error {
		status = 409;

		constructor() {
			super('A response is already streaming for this chat');
		}
	}

	return {
		ActiveChatRunError,
		startChatRun: vi.fn()
	};
});

vi.mock('$lib/server/chat/runs', () => ({
	ActiveChatRunError: mocks.ActiveChatRunError,
	startChatRun: mocks.startChatRun
}));

import { POST } from './+server';

const sessionId = '00000000-0000-4000-8000-000000000001';

function chatRequest(body: Record<string, unknown>) {
	return new Request('http://localhost/api/chat', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
}

describe('legacy chat route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('delegates direct legacy POST requests to tracked chat runs', async () => {
		const result = {
			run: {
				id: '00000000-0000-4000-8000-000000000002',
				sessionId,
				status: 'running',
				errorText: null,
				startedAt: new Date('2026-05-21T00:00:00.000Z'),
				completedAt: null
			},
			session: {
				id: sessionId,
				title: 'Hello',
				agentId: null,
				customInstruction: '',
				temperature: null
			}
		};
		mocks.startChatRun.mockResolvedValue(result);

		const response = await POST({
			request: chatRequest({ sessionId, message: 'hello' })
		} as never);

		expect(response.status).toBe(202);
		await expect(response.json()).resolves.toEqual({
			run: {
				...result.run,
				startedAt: '2026-05-21T00:00:00.000Z'
			},
			session: result.session
		});
		expect(mocks.startChatRun).toHaveBeenCalledWith({ sessionId, message: 'hello' });
	});

	it('surfaces active-run conflicts for direct legacy POST requests', async () => {
		mocks.startChatRun.mockRejectedValue(new mocks.ActiveChatRunError());

		await expect(
			POST({
				request: chatRequest({ sessionId, message: 'hello' })
			} as never)
		).rejects.toMatchObject({
			status: 409,
			body: { message: 'A response is already streaming for this chat' }
		});
		expect(mocks.startChatRun).toHaveBeenCalledWith({ sessionId, message: 'hello' });
	});
});
