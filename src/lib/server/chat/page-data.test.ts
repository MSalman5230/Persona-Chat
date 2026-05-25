import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	listAgentOptions: vi.fn(),
	listAgents: vi.fn(),
	listProviderConnections: vi.fn(),
	listChatSessions: vi.fn(),
	getChatSession: vi.fn(),
	listChatMessages: vi.fn(),
	resolveActiveChatRun: vi.fn(),
	serializeChatMessages: vi.fn()
}));

vi.mock('$lib/server/repositories/agents', () => ({
	listAgentOptions: mocks.listAgentOptions,
	listAgents: mocks.listAgents
}));

vi.mock('$lib/server/repositories/providers', () => ({
	listProviderConnections: mocks.listProviderConnections
}));

vi.mock('$lib/server/repositories/chat', () => ({
	getChatSession: mocks.getChatSession,
	listChatMessages: mocks.listChatMessages,
	listChatSessions: mocks.listChatSessions
}));

vi.mock('$lib/server/chat/runs', () => ({
	resolveActiveChatRun: mocks.resolveActiveChatRun
}));

vi.mock('$lib/server/chat/service', () => ({
	serializeChatMessages: mocks.serializeChatMessages
}));

import { loadChatPageData } from './page-data';

const userId = 'user-1';

describe('loadChatPageData', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.listProviderConnections.mockResolvedValue([
			{
				id: 'provider-1',
				name: 'OpenAI',
				defaultModel: 'gpt-5',
				models: ['gpt-5'],
				favoriteModels: ['gpt-5'],
				isDefault: true
			}
		]);
		mocks.listChatSessions.mockResolvedValue([]);
		mocks.listAgentOptions.mockResolvedValue([
			{
				id: 'agent-1',
				name: 'Researcher',
				isDefault: true
			}
		]);
		mocks.listAgents.mockResolvedValue([
			{
				id: 'agent-1',
				name: 'Researcher',
				systemPrompt: 'Large prompt body',
				toolNames: ['current_datetime'],
				mcpServerIds: ['00000000-0000-4000-8000-000000000001'],
				isDefault: true,
				createdAt: new Date(),
				updatedAt: new Date()
			}
		]);
		mocks.serializeChatMessages.mockReturnValue([]);
	});

	it('loads selector-only agent options for the chat page', async () => {
		const data = await loadChatPageData(userId);

		expect(mocks.listAgentOptions).toHaveBeenCalledWith(userId);
		expect(mocks.listProviderConnections).toHaveBeenCalledWith({ userId, enabledOnly: true });
		expect(mocks.listChatSessions).toHaveBeenCalledWith(userId);
		expect(mocks.listAgents).not.toHaveBeenCalled();
		expect(data.defaultAgentId).toBe('agent-1');
		expect(data.agents).toEqual([
			{
				id: 'agent-1',
				name: 'Researcher',
				isDefault: true
			}
		]);
		expect(data.agents[0]).not.toHaveProperty('systemPrompt');
		expect(data.agents[0]).not.toHaveProperty('toolNames');
		expect(data.agents[0]).not.toHaveProperty('mcpServerIds');
	});
});
