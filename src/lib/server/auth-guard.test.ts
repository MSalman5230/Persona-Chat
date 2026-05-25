import { describe, expect, it } from 'vitest';

import { authenticatedUser, requireAdmin } from './auth-guard';
import { isAdminRole } from './auth-role';

const adminUser = { id: 'admin-1', role: 'admin' };
const regularUser = { id: 'user-1', role: 'user' };

function eventFor(user: typeof adminUser | null) {
	return {
		locals: {
			user,
			session: user ? { id: 'session-1' } : null,
			isAdmin: isAdminRole(user?.role)
		}
	};
}

describe('auth guards', () => {
	it('returns the authenticated user', () => {
		expect(authenticatedUser(eventFor(regularUser) as never)).toBe(regularUser);
	});

	it('throws an invariant error when a protected route has no user', () => {
		expect(() => authenticatedUser(eventFor(null) as never)).toThrow(
			expect.objectContaining({
				status: 500,
				body: { message: 'Authenticated user missing from protected route' }
			})
		);
	});

	it('rejects non-admin users for admin-only operations', () => {
		expect(() => requireAdmin(eventFor(regularUser) as never)).toThrow(
			expect.objectContaining({
				status: 403,
				body: { message: 'Admin access required' }
			})
		);
	});

	it('allows admin users', () => {
		expect(requireAdmin(eventFor(adminUser) as never)).toBe(adminUser);
	});
});
