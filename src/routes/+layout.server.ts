import type { LayoutServerLoad } from './$types';

import { listChatSessions } from '$lib/server/repositories/chat';

export const load: LayoutServerLoad = async ({ locals }) => {
	const user = locals.user
		? {
				id: locals.user.id,
				name: locals.user.name,
				email: locals.user.email,
				image: locals.user.image ?? null
			}
		: null;

	const sidebarSessions = user ? await listChatSessions(user.id).catch(() => []) : [];

	return {
		user,
		isAdmin: locals.isAdmin,
		sidebarSessions
	};
};
