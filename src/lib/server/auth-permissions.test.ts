import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTH_APP_ADMIN_PERMISSION, AUTH_DEFAULT_ROLE } from './auth-role';

const { userHasPermission } = vi.hoisted(() => ({
	userHasPermission: vi.fn()
}));

vi.mock('$lib/server/auth', () => ({
	auth: {
		api: {
			userHasPermission
		}
	}
}));

import { userHasAdminPermission } from './auth-permissions';

describe('auth permissions', () => {
	beforeEach(() => {
		userHasPermission.mockReset();
	});

	it('delegates admin checks to Better Auth permissions', async () => {
		userHasPermission.mockResolvedValue({ success: true });

		await expect(userHasAdminPermission('user,admin')).resolves.toBe(true);

		expect(userHasPermission).toHaveBeenCalledWith({
			body: {
				role: 'user,admin',
				permissions: AUTH_APP_ADMIN_PERMISSION
			}
		});
	});

	it('uses the configured default role when the session has no role', async () => {
		userHasPermission.mockResolvedValue({ success: false });

		await expect(userHasAdminPermission(null)).resolves.toBe(false);

		expect(userHasPermission).toHaveBeenCalledWith({
			body: {
				role: AUTH_DEFAULT_ROLE,
				permissions: AUTH_APP_ADMIN_PERMISSION
			}
		});
	});

	it('denies admin access when Better Auth permission checks fail', async () => {
		userHasPermission.mockRejectedValue(new Error('permission backend unavailable'));

		await expect(userHasAdminPermission('admin')).resolves.toBe(false);
	});
});
