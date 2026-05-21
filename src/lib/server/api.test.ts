import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { apiErrorMessage, parseJsonRequest } from './api';

describe('API helpers', () => {
	it('returns useful validation messages', () => {
		const schema = z.object({ name: z.string().min(1, 'Name is required') });
		const result = schema.safeParse({ name: '' });

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(apiErrorMessage(result.error, 'Invalid request')).toBe('Name is required');
		}
	});

	it('turns invalid JSON into a 400 error', async () => {
		await expect(
			parseJsonRequest(
				new Request('https://example.test/api', { method: 'POST', body: '{' }),
				z.object({}),
				'Invalid request'
			)
		).rejects.toMatchObject({
			status: 400,
			body: { message: 'Invalid JSON request body' }
		});
	});
});
