import { describe, expect, it } from 'vitest';

import { isReplayableAgentMessage } from '$lib/server/agent/message-replay';
import type { PersistedAgentMessage } from '$lib/server/agent/messages';
import { normalizeAgentMessageForStorage } from './display';

const usage = {
	input: 1,
	output: 2,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 3,
	cost: {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		total: 0
	}
};

describe('normalizeAgentMessageForStorage', () => {
	it('stores replayable assistant messages in a PI-compatible shape', () => {
		const message: PersistedAgentMessage = {
			role: 'assistant',
			content: [{ type: 'text', text: 'Done.' }],
			api: 'openai-responses',
			provider: 'openai',
			model: 'gpt-5',
			usage,
			stopReason: 'stop',
			timestamp: 1
		};

		const stored = normalizeAgentMessageForStorage(message);

		expect(isReplayableAgentMessage(stored.piMessage)).toBe(true);
		expect(stored.piMessage).toEqual(message);
	});

	it('stores assistant placeholders without making them replayable', () => {
		const message: PersistedAgentMessage = {
			role: 'assistant',
			content: []
		};

		const stored = normalizeAgentMessageForStorage(message);

		expect(isReplayableAgentMessage(stored.piMessage)).toBe(false);
		expect(stored.piMessage).toEqual(message);
	});

	it('keeps legacy invalid rows intact for replay filtering', () => {
		const legacy: PersistedAgentMessage = {
			role: 'user',
			content: [{ type: 'unknown' }],
			timestamp: 2
		};

		const stored = normalizeAgentMessageForStorage(legacy);

		expect(isReplayableAgentMessage(stored.piMessage)).toBe(false);
		expect(stored.piMessage).toEqual(legacy);
	});
});
