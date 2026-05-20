import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { env } from '$env/dynamic/private';

import { decryptJson, encryptJson, hasCredentialEncryptionKey } from './crypto';

const originalKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
const originalDynamicKey = env.CREDENTIAL_ENCRYPTION_KEY;

describe('credential crypto', () => {
	beforeEach(() => {
		process.env.CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
		env.CREDENTIAL_ENCRYPTION_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY;
	});

	afterEach(() => {
		if (originalKey === undefined) delete process.env.CREDENTIAL_ENCRYPTION_KEY;
		else process.env.CREDENTIAL_ENCRYPTION_KEY = originalKey;

		if (originalDynamicKey === undefined) Reflect.deleteProperty(env, 'CREDENTIAL_ENCRYPTION_KEY');
		else env.CREDENTIAL_ENCRYPTION_KEY = originalDynamicKey;
	});

	it('encrypts and decrypts JSON payloads with AES-GCM metadata', () => {
		const payload = { apiKey: 'sk-test-secret', headers: { Authorization: 'Bearer token' } };
		const encrypted = encryptJson(payload);

		expect(encrypted.version).toBe(1);
		expect(encrypted.iv).toBeTruthy();
		expect(encrypted.tag).toBeTruthy();
		expect(encrypted.ciphertext).not.toContain(payload.apiKey);
		expect(decryptJson(encrypted)).toEqual(payload);
	});

	it('fails fast when the encryption key is missing', () => {
		delete process.env.CREDENTIAL_ENCRYPTION_KEY;
		Reflect.deleteProperty(env, 'CREDENTIAL_ENCRYPTION_KEY');

		expect(hasCredentialEncryptionKey()).toBe(false);
		expect(() => encryptJson({ value: 'secret' })).toThrow(/CREDENTIAL_ENCRYPTION_KEY/);
	});
});
