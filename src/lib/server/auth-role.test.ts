import { describe, expect, it } from 'vitest';

import { isAdminRole, roleForNewUser } from './auth-role';

describe('auth role helpers', () => {
	it('makes the first signed-up user admin and later users regular users', () => {
		expect(roleForNewUser(0)).toBe('admin');
		expect(roleForNewUser(1)).toBe('user');
		expect(roleForNewUser(12)).toBe('user');
	});

	it('detects admin in Better Auth role strings', () => {
		expect(isAdminRole('admin')).toBe(true);
		expect(isAdminRole('user, admin')).toBe(true);
		expect(isAdminRole('user')).toBe(false);
		expect(isAdminRole(null)).toBe(false);
	});
});
