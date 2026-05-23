import { describe, expect, it } from 'vitest';

import { serializeChatMessage } from './service';

describe('chat message serialization', () => {
	it('includes the persisted sequence for stable streaming identity', () => {
		const createdAt = new Date('2026-05-23T00:00:00.000Z');
		const message = serializeChatMessage({
			id: 'message-1',
			sessionId: 'session-1',
			sequence: 7,
			role: 'assistant',
			contentText: 'Done.',
			piMessage: {
				role: 'assistant',
				content: [{ type: 'text', text: 'Done.' }]
			},
			display: {
				role: 'assistant',
				text: 'Done.',
				thoughts: [],
				tools: []
			},
			createdAt
		} as never);

		expect(message).toMatchObject({
			id: 'message-1',
			sequence: 7,
			role: 'assistant',
			text: 'Done.',
			createdAt
		});
	});
});
