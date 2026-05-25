import { describe, expect, it } from 'vitest';

import { requireAdmin, requireUser, userIsAdmin } from './auth-guard';

const adminUser = { id: 'admin-1', role: 'admin' };
const regularUser = { id: 'user-1', role: 'user' };

function eventFor(user: typeof adminUser | null) {
	return {
		locals: {
			user,
			session: user ? { id: 'session-1' } : null,
			isAdmin: userIsAdmin(user as never)
		}
	};
}

describe('auth guards', () => {
	it('returns the authenticated user', () => {
		expect(requireUser(eventFor(regularUser) as never)).toBe(regularUser);
	});

	it('rejects unauthenticated requests', () => {
		expect(() => requireUser(eventFor(null) as never)).toThrow(
			expect.objectContaining({
				status: 401,
				body: { message: 'Authentication required' }
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
