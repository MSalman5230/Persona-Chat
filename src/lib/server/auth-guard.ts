import { error, type RequestEvent } from '@sveltejs/kit';

import type { AuthUser } from '$lib/server/auth';

export function requireUser(event: RequestEvent): AuthUser {
	const user = event.locals.user;
	if (!user) error(401, 'Authentication required');
	return user;
}

export function requireAdmin(event: RequestEvent): AuthUser {
	const user = requireUser(event);
	if (!event.locals.isAdmin) error(403, 'Admin access required');
	return user;
}
