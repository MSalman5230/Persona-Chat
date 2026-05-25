import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	userHasPermission: vi.fn()
}));

vi.mock('$lib/server/auth', () => ({
	auth: {
		api: {
			userHasPermission: mocks.userHasPermission
		}
	}
}));

import { hasAdminAccess } from './guards';

describe('auth guard admin access', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('delegates admin checks to Better Auth admin permissions', async () => {
		mocks.userHasPermission.mockResolvedValue({ success: true, error: null });

		await expect(hasAdminAccess('user-1')).resolves.toBe(true);
		expect(mocks.userHasPermission).toHaveBeenCalledWith({
			body: {
				userId: 'user-1',
				permissions: {
					user: ['list']
				}
			}
		});
	});

	it('treats denied Better Auth permissions as non-admin', async () => {
		mocks.userHasPermission.mockResolvedValue({ success: false, error: null });

		await expect(hasAdminAccess('user-1')).resolves.toBe(false);
	});
});
