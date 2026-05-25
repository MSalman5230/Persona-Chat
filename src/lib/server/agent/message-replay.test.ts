import { describe, expect, it, vi } from 'vitest';

import { replayHistory } from './message-replay';
import type { PersistedAgentMessage } from './messages';

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

function assistantMessage(overrides: Partial<PersistedAgentMessage> = {}): PersistedAgentMessage {
	return {
		role: 'assistant',
		content: [{ type: 'text', text: 'Earlier answer.' }],
		api: 'openai-responses',
		provider: 'openai',
		model: 'gpt-5',
		usage,
		stopReason: 'stop',
		timestamp: 2,
		...overrides
	};
}

describe('message replay', () => {
	it('replays PI-compatible user, assistant, and tool-result messages', () => {
		const appendMessage = vi.fn();
		const history: PersistedAgentMessage[] = [
			{ role: 'user', content: [{ type: 'text', text: 'Earlier question.' }], timestamp: 1 },
			assistantMessage(),
			{
				role: 'toolResult',
				toolCallId: 'call-1',
				toolName: 'current_datetime',
				content: [{ type: 'text', text: '2026-05-25' }],
				isError: false,
				timestamp: 3
			}
		];

		replayHistory({ appendMessage }, history);

		expect(appendMessage).toHaveBeenCalledTimes(3);
		expect(appendMessage.mock.calls.map(([message]) => message.role)).toEqual([
			'user',
			'assistant',
			'toolResult'
		]);
	});

	it('skips placeholders, metadata, and invalid content blocks', () => {
		const appendMessage = vi.fn();
		const history: PersistedAgentMessage[] = [
			assistantMessage({ content: [] }),
			{ role: 'system', content: [{ type: 'text', text: 'metadata' }], timestamp: 1 },
			{ role: 'user', content: [{ type: 'unknown' }], timestamp: 2 },
			assistantMessage({ usage: undefined })
		];

		replayHistory({ appendMessage }, history);

		expect(appendMessage).not.toHaveBeenCalled();
	});

	it('skips legacy persisted rows with invalid unknown content blocks', () => {
		const appendMessage = vi.fn();
		replayHistory(
			{ appendMessage },
			[{ role: 'user', content: [{ type: 'unknown' }], timestamp: 2 }]
		);

		expect(appendMessage).not.toHaveBeenCalled();
	});
});
