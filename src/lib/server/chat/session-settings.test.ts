import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getAgent: vi.fn(),
	updateChatSession: vi.fn()
}));

vi.mock('$lib/server/repositories/agents', () => ({
	getAgent: mocks.getAgent,
	normalizeAgentIdForStorage: (id: string | null | undefined) =>
		id && id !== '00000000-0000-4000-8000-000000000000' ? id : null
}));

vi.mock('$lib/server/repositories/chat', () => ({
	updateChatSession: mocks.updateChatSession
}));

import {
	ChatSessionSettingsValidationError,
	updateChatSessionSettings
} from './session-settings';
import type { ChatSessionRow } from '$lib/server/repositories/chat';
import { PREBUILT_GENERAL_AGENT_ID } from '$lib/shared/prebuilt-general-agent';

const session: ChatSessionRow = {
	id: '00000000-0000-4000-8000-000000000001',
	userId: 'user-1',
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

		const updated = await updateChatSessionSettings('user-1', session, patch);

		expect(mocks.getAgent).toHaveBeenCalledWith('user-1', patch.agentId);
		expect(mocks.updateChatSession).toHaveBeenCalledWith('user-1', session.id, patch);
		expect(updated).toMatchObject({
			id: session.id,
			title: session.title,
			...patch
		});
		expect(updated.updatedAt).toBeInstanceOf(Date);
	});

	it('stores the Prebuilt General Agent selection as null', async () => {
		const patch = { agentId: PREBUILT_GENERAL_AGENT_ID };

		const updated = await updateChatSessionSettings('user-1', session, patch);

		expect(mocks.getAgent).not.toHaveBeenCalled();
		expect(mocks.updateChatSession).toHaveBeenCalledWith('user-1', session.id, { agentId: null });
		expect(updated.agentId).toBeNull();
	});

	it('rejects unknown agents before updating the chat session', async () => {
		mocks.getAgent.mockResolvedValue(undefined);
		const patch = { agentId: '00000000-0000-4000-8000-000000000099' };

		await expect(updateChatSessionSettings('user-1', session, patch)).rejects.toBeInstanceOf(
			ChatSessionSettingsValidationError
		);
		expect(mocks.updateChatSession).not.toHaveBeenCalled();
	});
});
