import type { LayoutServerLoad } from './$types';

import { hasAdminAccess } from '$lib/server/auth/guards';

export const load: LayoutServerLoad = async ({ locals }) => ({
	user: locals.user
		? {
				id: locals.user.id,
				name: locals.user.name,
				email: locals.user.email,
				image: locals.user.image ?? null
			}
		: null,
	isAdmin: locals.user ? await hasAdminAccess(locals.user.id) : false
});
