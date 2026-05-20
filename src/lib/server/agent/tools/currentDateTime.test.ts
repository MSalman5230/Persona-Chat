import { describe, expect, it } from 'vitest';

import { currentDateTimeTool } from './currentDateTime';

describe('current_datetime tool', () => {
	it('returns ISO time and local timezone metadata', async () => {
		const result = await currentDateTimeTool.execute('call-1', {}, undefined, undefined, {} as never);

		expect(result.content[0]?.type).toBe('text');
		expect(result.details).toMatchObject({
			timeZone: expect.any(String),
			offset: expect.stringMatching(/^[+-]\d{2}:\d{2}$/),
			iso: expect.any(String)
		});
		expect(Number.isNaN(Date.parse(result.details.iso))).toBe(false);
	});
});
