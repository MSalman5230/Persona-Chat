import { describe, expect, it } from 'vitest';

import { assertStringRecord, tryParseJsonObject, tryParseStringRecord } from './json';

describe('JSON helpers', () => {
	it('parses JSON objects', () => {
		expect(tryParseJsonObject('{"enabled":true}', 'Config')).toEqual({ enabled: true });
	});

	it('rejects non-object JSON values', () => {
		expect(() => tryParseJsonObject('[]', 'Config')).toThrow('Config must be a JSON object');
	});

	it('parses string records and reports the invalid key', () => {
		expect(tryParseStringRecord('{"Authorization":"Bearer token"}', 'Headers')).toEqual({
			Authorization: 'Bearer token'
		});
		expect(() => assertStringRecord({ Authorization: 123 }, 'Headers')).toThrow(
			'Headers.Authorization must be a string'
		);
	});
});
