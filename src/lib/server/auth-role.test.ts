import { describe, expect, it } from 'vitest';

import {
	AUTH_ADMIN_ROLES,
	AUTH_APP_ADMIN_PERMISSION,
	AUTH_DEFAULT_ROLE,
	AUTH_ROLES,
	isAdminRole,
	roleForNewUser,
	rolesFromAuthRoleString
} from './auth-role';

describe('auth role helpers', () => {
	it('exposes the Better Auth role defaults from one source', () => {
		expect(AUTH_DEFAULT_ROLE).toBe('user');
		expect(AUTH_ADMIN_ROLES).toEqual(['admin']);
	});

	it('uses Better Auth access-control roles for app admin permission', () => {
		expect(AUTH_ROLES.admin.authorize(AUTH_APP_ADMIN_PERMISSION).success).toBe(true);
		expect(AUTH_ROLES.user.authorize(AUTH_APP_ADMIN_PERMISSION).success).toBe(false);
	});

	it('makes the first signed-up user admin and later users regular users', () => {
		expect(roleForNewUser(0)).toBe('admin');
		expect(roleForNewUser(1)).toBe(AUTH_DEFAULT_ROLE);
		expect(roleForNewUser(12)).toBe(AUTH_DEFAULT_ROLE);
	});

	it('detects admin in Better Auth role strings', () => {
		expect(isAdminRole('admin')).toBe(true);
		expect(isAdminRole('user, admin')).toBe(true);
		expect(isAdminRole(' user , admin ')).toBe(true);
		expect(isAdminRole('user')).toBe(false);
		expect(isAdminRole(null)).toBe(false);
	});

	it('parses comma-separated Better Auth role strings', () => {
		expect(rolesFromAuthRoleString('user, admin')).toEqual(['user', 'admin']);
		expect(rolesFromAuthRoleString(' user , , admin ')).toEqual(['user', 'admin']);
		expect(rolesFromAuthRoleString(undefined)).toEqual([]);
	});
});
