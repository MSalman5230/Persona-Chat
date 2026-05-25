import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getAgent: vi.fn(),
	updateChatSession: vi.fn()
}));

vi.mock('$lib/server/repositories/agents', () => ({
	getAgent: mocks.getAgent
}));

vi.mock('$lib/server/repositories/chat', () => ({
	updateChatSession: mocks.updateChatSession
}));

import {
	ChatSessionSettingsValidationError,
	updateChatSessionSettings
} from './session-settings';
import type { ChatSessionRow } from '$lib/server/repositories/chat';

const userId = 'user-1';

const session: ChatSessionRow = {
	id: '00000000-0000-4000-8000-000000000001',
	userId,
	title: 'Planning',
	agentId: null,
	providerConnectionId: null,
	providerId: null,
	modelId: null,
	thinkingLevel: null,
	temperature: null,
	createdAt: new Date('2026-05-21T00:00:00.000Z'),
	updatedAt: new Date('2026-05-21T00:00:00.000Z')
};

describe('chat session settings service', () => {
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
		mocks.updateChatSession.mockResolvedValue(undefined);
	});

	it('validates an agent before updating the chat session', async () => {
		const patch = {
			agentId: '00000000-0000-4000-8000-000000000003',
			temperature: null
		};

		const updated = await updateChatSessionSettings(userId, session, patch);

		expect(mocks.getAgent).toHaveBeenCalledWith(userId, patch.agentId);
		expect(mocks.updateChatSession).toHaveBeenCalledWith(userId, session.id, patch);
		expect(updated).toMatchObject({
			id: session.id,
			title: session.title,
			...patch
		});
		expect(updated.updatedAt).toBeInstanceOf(Date);
	});

	it('allows clearing the agent without an agent lookup', async () => {
		const patch = { agentId: null };

		const updated = await updateChatSessionSettings(userId, session, patch);

		expect(mocks.getAgent).not.toHaveBeenCalled();
		expect(mocks.updateChatSession).toHaveBeenCalledWith(userId, session.id, patch);
		expect(updated.agentId).toBeNull();
	});

	it('rejects unknown agents before updating the chat session', async () => {
		mocks.getAgent.mockResolvedValue(undefined);
		const patch = { agentId: '00000000-0000-4000-8000-000000000099' };

		await expect(updateChatSessionSettings(userId, session, patch)).rejects.toBeInstanceOf(
			ChatSessionSettingsValidationError
		);
		expect(mocks.updateChatSession).not.toHaveBeenCalled();
	});
});
