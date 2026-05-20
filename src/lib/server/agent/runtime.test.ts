import { describe, expect, it } from 'vitest';

import { BLANK_SYSTEM_PROMPT_SENTINEL } from '$lib/server/chat/settings';

import { wrapStreamFnWithSessionSettings } from './runtime';

describe('agent runtime session settings', () => {
	it('strips the blank prompt sentinel before calling PI providers', () => {
		const calls: Array<{ context: { systemPrompt?: string }; options: Record<string, unknown> }> = [];
		const streamFn = ((
			_model: unknown,
			context: { systemPrompt?: string },
			options: Record<string, unknown>
		) => {
			calls.push({ context, options });
			return 'stream';
		}) as unknown as Parameters<typeof wrapStreamFnWithSessionSettings>[0];

		const result = wrapStreamFnWithSessionSettings(streamFn, null)(
			{} as never,
			{ systemPrompt: BLANK_SYSTEM_PROMPT_SENTINEL, messages: [] } as never,
			{} as never
		);

		expect(result).toBe('stream');
		expect(calls[0].context.systemPrompt).toBe('');
		expect(calls[0].options).not.toHaveProperty('temperature');
	});

	it('preserves exact prompts and injects explicit temperature', () => {
		const calls: Array<{ context: { systemPrompt?: string }; options: Record<string, unknown> }> = [];
		const streamFn = ((
			_model: unknown,
			context: { systemPrompt?: string },
			options: Record<string, unknown>
		) => {
			calls.push({ context, options });
			return 'stream';
		}) as unknown as Parameters<typeof wrapStreamFnWithSessionSettings>[0];

		wrapStreamFnWithSessionSettings(streamFn, 0.4)(
			{} as never,
			{ systemPrompt: 'Use plain language.', messages: [] } as never,
			{ maxTokens: 256 } as never
		);

		expect(calls[0].context.systemPrompt).toBe('Use plain language.');
		expect(calls[0].options).toMatchObject({
			maxTokens: 256,
			temperature: 0.4
		});
	});
});
