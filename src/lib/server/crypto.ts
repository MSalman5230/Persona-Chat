import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import type { EncryptedJsonPayload } from './db/schema';

const KEY_ENV = 'CREDENTIAL_ENCRYPTION_KEY';

function getRawKey(): string {
	const key = process.env[KEY_ENV];
	if (!key) {
		throw new Error(`${KEY_ENV} is required before saving or using encrypted credentials`);
	}
	return key;
}

function decodeKey(): Buffer {
	const raw = getRawKey().trim();
	const base64 = Buffer.from(raw, 'base64');

	if (base64.length === 32) return base64;

	const utf8 = Buffer.from(raw, 'utf8');
	if (utf8.length === 32) return utf8;

	const hex = Buffer.from(raw, 'hex');
	if (/^[0-9a-fA-F]+$/.test(raw) && hex.length === 32) return hex;

	throw new Error(`${KEY_ENV} must be a 32-byte key, base64-encoded 32-byte key, or 64-char hex key`);
}

export function hasCredentialEncryptionKey(): boolean {
	try {
		decodeKey();
		return true;
	} catch {
		return false;
	}
}

export function encryptJson<T>(value: T): EncryptedJsonPayload {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', decodeKey(), iv);
	const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
	const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
	const tag = cipher.getAuthTag();

	return {
		version: 1,
		iv: iv.toString('base64'),
		tag: tag.toString('base64'),
		ciphertext: ciphertext.toString('base64')
	};
}

export function decryptJson<T>(payload: EncryptedJsonPayload | null | undefined): T | null {
	if (!payload) return null;
	if (payload.version !== 1) throw new Error(`Unsupported encrypted payload version: ${payload.version}`);

	const decipher = createDecipheriv('aes-256-gcm', decodeKey(), Buffer.from(payload.iv, 'base64'));
	decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
	const plaintext = Buffer.concat([
		decipher.update(Buffer.from(payload.ciphertext, 'base64')),
		decipher.final()
	]);

	return JSON.parse(plaintext.toString('utf8')) as T;
}

export function redactSecret(value: string | null | undefined): string | null {
	if (!value) return null;
	if (value.length <= 8) return '••••';
	return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}
