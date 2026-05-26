import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	listAgentOptions: vi.fn(),
	listAgents: vi.fn(),
	getEffectiveUserSettings: vi.fn(),
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

vi.mock('$lib/server/repositories/user-settings', () => ({
	getEffectiveUserSettings: mocks.getEffectiveUserSettings
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
import { PREBUILT_GENERAL_AGENT_ID } from '$lib/shared/prebuilt-general-agent';

describe('loadChatPageData', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getEffectiveUserSettings.mockResolvedValue({
			providers: [
				{
					id: 'provider-1',
					name: 'OpenAI',
					defaultModel: 'gpt-5',
					models: ['gpt-5'],
					favoriteModels: ['gpt-5'],
					isDefault: true
				}
			],
			defaultProviderId: 'provider-1',
			defaultModel: 'gpt-5',
			defaultThinkingLevel: 'medium'
		});
		mocks.listChatSessions.mockResolvedValue([]);
		mocks.listAgentOptions.mockResolvedValue([
			{
				id: 'agent-1',
				name: 'Researcher',
				isDefault: true,
				isPrebuilt: false
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
		const data = await loadChatPageData('user-1');

		expect(mocks.listAgentOptions).toHaveBeenCalledWith('user-1');
		expect(mocks.listAgents).not.toHaveBeenCalled();
		expect(data.defaultAgentId).toBe('agent-1');
		expect(data.agents).toEqual([
			{
				id: 'agent-1',
				name: 'Researcher',
				isDefault: true,
				isPrebuilt: false
			}
		]);
		expect(data.agents[0]).not.toHaveProperty('systemPrompt');
		expect(data.agents[0]).not.toHaveProperty('toolNames');
		expect(data.agents[0]).not.toHaveProperty('mcpServerIds');
	});

	it('uses the Prebuilt General Agent when there are no database agents', async () => {
		mocks.listAgentOptions.mockResolvedValue([
			{
				id: PREBUILT_GENERAL_AGENT_ID,
				name: 'General Agent Alfred',
				isDefault: true,
				isPrebuilt: true
			}
		]);

		const data = await loadChatPageData('user-1');

		expect(data.defaultAgentId).toBe(PREBUILT_GENERAL_AGENT_ID);
		expect(data.agents).toEqual([
			{
				id: PREBUILT_GENERAL_AGENT_ID,
				name: 'General Agent Alfred',
				isDefault: true,
				isPrebuilt: true
			}
		]);
	});
});
