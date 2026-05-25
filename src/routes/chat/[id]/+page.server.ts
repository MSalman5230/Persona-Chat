import type { PageServerLoad } from './$types';

import { requireUser } from '$lib/server/auth-guard';
import { loadChatPageData } from '$lib/server/chat/page-data';

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	return loadChatPageData(user.id, event.params.id);
};
