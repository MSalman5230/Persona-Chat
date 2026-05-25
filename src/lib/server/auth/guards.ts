import { error, redirect } from '@sveltejs/kit';

import { auth } from '$lib/server/auth';

type LocalsLike = Pick<App.Locals, 'user' | 'session'>;

export function safeRedirectPath(value: string | null | undefined, fallback = '/'): string {
	if (!value) return fallback;
	if (!value.startsWith('/') || value.startsWith('//')) return fallback;
	if (value.startsWith('/api/auth')) return fallback;
	return value;
}

export function requireUser(locals: LocalsLike): NonNullable<App.Locals['user']> {
	if (!locals.user) error(401, 'Authentication required');
	return locals.user;
}

export async function hasAdminAccess(userId: string): Promise<boolean> {
	try {
		const result = await auth.api.userHasPermission({
			body: {
				userId,
				permissions: {
					user: ['list']
				}
			}
		});
		return result.success === true;
	} catch {
		return false;
	}
}

export async function requireAdmin(locals: LocalsLike): Promise<NonNullable<App.Locals['user']>> {
	const user = requireUser(locals);
	if (!(await hasAdminAccess(user.id))) error(403, 'Admin access required');
	return user;
}

export function redirectToLogin(pathname: string, search = ''): never {
	const redirectTo = encodeURIComponent(`${pathname}${search}`);
	redirect(303, `/login?redirectTo=${redirectTo}`);
}
