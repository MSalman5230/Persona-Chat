import { describe, expect, it } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

import {
	adminAccess,
	authenticatedAccess,
	buildAccessPolicy,
	runtimeResourceFilter
} from './resource-policy';
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
	} as RequestEvent;
}

describe('resource access policy', () => {
	it('builds management and runtime filters from the admin flag', () => {
		expect(buildAccessPolicy('admin-1', true)).toEqual({
			userId: 'admin-1',
			isAdmin: true,
			resources: {
				management: { enabledOnly: false },
				runtime: { enabledOnly: true }
			}
		});
		expect(buildAccessPolicy('user-1', false).resources.management).toEqual({
			enabledOnly: true
		});
	});

	it('derives authenticated access from request locals', () => {
		expect(authenticatedAccess(eventFor(regularUser))).toMatchObject({
			userId: 'user-1',
			isAdmin: false,
			resources: {
				management: { enabledOnly: true },
				runtime: { enabledOnly: true }
			}
		});
	});

	it('requires a user before returning access policy', () => {
		expect(() => authenticatedAccess(eventFor(null))).toThrow(
			expect.objectContaining({ status: 401 })
		);
	});

	it('requires admin access for admin policy', () => {
		expect(() => adminAccess(eventFor(regularUser))).toThrow(
			expect.objectContaining({ status: 403 })
		);
		expect(adminAccess(eventFor(adminUser))).toMatchObject({
			userId: 'admin-1',
			isAdmin: true
		});
	});

	it('keeps the standalone runtime filter for non-request code paths', () => {
		expect(runtimeResourceFilter()).toEqual({ enabledOnly: true });
	});
});
